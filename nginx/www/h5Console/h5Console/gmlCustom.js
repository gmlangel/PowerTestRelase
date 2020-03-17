var logClassNameArr = ["logStyle","logStyle logWarn","logStyle logErr","logStyle logDebug"];

var autoStopId = -1;
//当点击了开始测试
function onStartTestingClick(data){
    //开始压测
    if(isTesting == true){
        layer.msg('正在压测中，如需重新开始，请先点击"停止压测"')
         return false;
    }
    $("#formStart").removeClass();
    $("#formStart").addClass("layui-btn layui-btn-primary")
    $("#formStop").removeClass();
    $("#formStop").addClass("layui-btn")
       console.log(JSON.stringify(data.field));
       //清空原有日志
       document.getElementById("log_container").innerHTML = "";
       printLog("压测日志:",-1);
       //封装启动协议
        let obj = {"cmd":0xff000001};
        let needConverKeyArr = [
            "concurrency",
            "concurrency_offset",
            "concurrency_increase_offset_time",
            "concurrency_random_min",
            "concurrency_random_max",
            "concurrency_random_offset_time",
            "session_count",
            "user_count_of_session",
            "tb_testing_end_time"
        ]
        let tmpN;
        for(key in data.field){
            if(needConverKeyArr.indexOf(key) > -1){
                tmpN = parseFloat(data.field[key]);//转换数据类型
                if(isNaN(tmpN)){
                    obj[key] = 0;//转换失败，默认给0
                }else{
                    obj[key] = tmpN;
                }
            }else{
                obj[key] = data.field[key];
            }
            
        }
        //特殊处理， 向OBJ塞入ip区域信息
        if(data.field["switch_ip_random"] && data.field["switch_ip_random"] == "on"){
            //ip_random_type
            let ipArr = [];
            let ipNode = document.getElementsByName("checkbox_iprandom");
            ipNode.forEach(function(node,idx){
                if(node.checked){
                    ipArr.push(node.value)
                }
            })
            obj["iplist"] = ipArr;
        }
        if(dataProviderWebSocket){
            if(dataProviderWebSocket.isConnected == false){
                layer.msg("压测服务器还未连接成功，请稍后重试......")
                return false;
            }
          //向服务器发送请求
          sendWebSocketMsg(dataProviderWebSocket,JSON.stringify(obj));
        }
        layer.msg("压测程序启动中......")
        isTesting = true;
        //计算是否需要自动停止
        let endTimeStr = data.field["tb_testing_end_time"];
        if(endTimeStr && endTimeStr != ""){
            let endTime = new Date(endTimeStr).valueOf();
            let nowTime = new Date().valueOf();
            let result = endTime - nowTime;
            if(isNaN(result) == false && result > 0){
                autoStopId = setTimeout(function(){
                    //自动停止
                    onStopTestingClick(null);
                },result)
            }
        }
        return false;
}

//当点击停止测试
function onStopTestingClick(evt){
    if(autoStopId > -1)
        clearTimeout(autoStopId)
    autoStopId = -1
    if(dataProviderWebSocket == null || (dataProviderWebSocket != null && dataProviderWebSocket.isConnected == false)){
        layer.msg("压测服务器已断开，请稍后重试...")
        return;
    }
    layer.msg('压测已停止')
    if(isTesting == true){
        $("#formStart").removeClass();
        $("#formStart").addClass("layui-btn")
        $("#formStop").removeClass();
        $("#formStop").addClass("layui-btn layui-btn-primary")
      let obj = {"cmd":0xff000002};
      if(dataProviderWebSocket){
            //向服务器发送请求
            sendWebSocketMsg(dataProviderWebSocket,JSON.stringify(obj));
      }
    }
    isTesting = false;
  }


/**
 * 创建webSocket连接
 * @param host string 服务地址
 * @param port uint16 服务端口
 * @param funcName string 服务端处理程序的名称
 * 
*/
var pkgHead = "<gmlb>"
var pkgFoot = "<gmle>"
var heartbeatID = -1;
function createWebSocketConn(fullPath,host,onCloseCallBackFunc){
    let ws = new WebSocket(fullPath);
    ws.isConnected = false;
    ws.onopen = function(){
        ws.isConnected = true;
        console.log("ws服务:"+host+"连接成功")
    }
    ws.onclose = function(){
        ws.isConnected = false;
        console.log("ws服务:"+host+"连接断开")
        if(heartbeatID > -1){
            //停止心跳
            clearInterval(heartbeatID);
            heartbeatID = -1;
        }
        if(onCloseCallBackFunc != null){
            //调用socket 关闭回调
            onCloseCallBackFunc()
        }
    }
    ws.onmessage = function(evt){
        let datastr = evt.data || "";
        if(datastr.indexOf(pkgHead)<0 || datastr.indexOf(pkgFoot)<0)
            return;
        datastr = datastr.substring(datastr.indexOf(pkgHead) + 6,datastr.indexOf(pkgFoot))
        if("" != datastr){
            let pkg = JSON.parse(datastr);//这里差了个去头、尾操作
            if(pkg){
                let command = pkg.cmd;
                switch(command){
                    case 0xff000004:
                    //收到了压测数据更新
                    makeTestingResultAndPrint(pkg)
                    break;
                    case 0xff000000:
                        //收到了服务器返回的初始化信令
                        let stat = pkg.isRunning
                        if(stat == true){
                            //压测已经启动，改变按钮状态
                            isTesting = true;
                            $("#formStart").removeClass();
                            $("#formStart").addClass("layui-btn layui-btn-primary")
                            $("#formStop").removeClass();
                            $("#formStop").addClass("layui-btn")
                        }
                        //启动心跳
                        heartbeatID = setInterval(function(){
                            let obj = {"cmd":0xff000003};
                            sendWebSocketMsg(ws,JSON.stringify(obj));
                        },50000)
                        break;
                    case 0xff000005:
                        //收到了启动状态回执
                        let runStat = pkg.isRunning
                        if(runStat == false){
                            //压测程序未启动成功
                            isTesting = false;
                            //还原按钮状态
                            $("#formStart").removeClass();
                            $("#formStart").addClass("layui-btn layui-btn-primary")
                            $("#formStop").removeClass();
                            $("#formStop").addClass("layui-btn")
                            //给与提示
                            layer.msg("压测程序启动失败，请稍后重试")
                        }else{
                            layer.msg("压测程序启动成功")
                        }
                        break;
                }
            }
        }
    }
    return ws;
}

/**
 * 将压测数据json，转换为字符串
 * 
*/
function makeTestingResultAndPrint(pkg){
    let datatime = pkg.Nowtime || 0;
    let timeStr = ""
    if(datatime != 0){
        timeStr = dateFormat("HH:MM:SS",new Date(datatime*1000))
    }
    let msg = "";
    msg += "当前并发用户数: " + pkg.Cur_user_count + ",  "
    if(pkg.Cur_sessionCount > 0){
        msg += "当前会话数: " + pkg.Cur_sessionCount + ",  "
    }
    msg += "信令req: " + pkg.Concurrency_req_per_second + "/s,  "
    msg += "信令res: " + pkg.Concurrency_complete_per_second + "/s,  "
    //msg += "每秒心跳: " + pkg.HeartBeatCount_per_second + ",  "
    msg += "信令每5秒响应比" + (parseFloat(pkg.Success_rate_five_second) * 100).toFixed(2) + "%,  "
    msg += "UDP发包数: " + pkg.UdpReqCount_per_second + "/s,  "
    msg += "UDP收包数: " + pkg.UdpRecivedCount_per_second + "/s"
    printLog(msg,0,timeStr)
}

/**
 * 
 * 时间格式化
*/
function dateFormat(fmt, date) {
    let ret;
    const opt = {
        "Y+": date.getFullYear().toString(),        // 年
        "m+": (date.getMonth() + 1).toString(),     // 月
        "d+": date.getDate().toString(),            // 日
        "H+": date.getHours().toString(),           // 时
        "M+": date.getMinutes().toString(),         // 分
        "S+": date.getSeconds().toString()          // 秒
        // 有其他格式化字符需求可以继续添加，必须转化成字符串
    };
    for (let k in opt) {
        ret = new RegExp("(" + k + ")").exec(fmt);
        if (ret) {
            fmt = fmt.replace(ret[1], (ret[1].length == 1) ? (opt[k]) : (opt[k].padStart(ret[1].length, "0")))
        };
    };
    return fmt;
}

/**
 * 根据协议定制封装websocke的消息发送格式
 * 
*/
function sendWebSocketMsg(ws,msg){
    let resultMsg = "<gmlb>"+msg+"<gmle>"
    ws.send(resultMsg);
}

/**
 * 在控制台中打印日志
*/
function printLog(msg,logType = 0,timeStr = ""){
    let log_container = document.getElementById("log_container")
    let logNode = document.createElement("span")
    if(logType == -1)
        logNode.className = logClassNameArr[0];
    else
        logNode.className = logClassNameArr[logType];
    switch(logType){
        case 0:
        logNode.innerText = "[log]" + timeStr + " " + msg;
        break;
        case 1:
        logNode.innerText = "[Warn]" + timeStr + " " + msg;
        break;
        case 2:
        logNode.innerText = "[Err]" + timeStr + " " + msg;
        break;
        case 3:
        logNode.innerText = "[Debug]" + timeStr + " " + msg;
            break;
        default :
        logNode.innerHTML = msg;
        break;
    }
    log_container.appendChild(logNode);
    // let brNode = document.createElement("br");
    // log_container.appendChild(brNode);
    log_container.scrollTop = log_container.scrollHeight;//设置内容滚动到最底部                 
}
var logClassNameArr = ["logStyle","logStyle logWarn","logStyle logErr","logStyle logDebug"];

var autoStopId = -1;
var testingResultMap = {}
var ser_count = 0;//压测服务器数量
var startTestArgsObj = null;
//当点击了开始测试
function onStartTestingClick(data){
    //开始压测
    if(isTestingState == true){
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
            "tb_testing_end_time",
            "offline_timeoffset"
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
        startTestArgsObj = obj;
        let canStart = false;//是否可以启动
        for(key in dataProviderWebSocketArr){
            if(dataProviderWebSocketArr[key] && dataProviderWebSocketArr[key].isConnected == true){
                canStart = true;
                dataProviderWebSocketArr[key].isTesting = true;
                startTestArgsObj.sevID = dataProviderWebSocketArr[key].id;
                startTestArgs = JSON.stringify(startTestArgsObj)
                sendWebSocketMsg(dataProviderWebSocketArr[key],startTestArgs);
            }
        }
        // if(canStart == false){
        //     layer.msg("压测服务器还未连接成功，请稍后重试......")
        //     return false;
        // }
        layer.msg("压测程序启动中......")
        isTestingState = true;
        //计算是否需要自动停止
        let endTimeStr = data.field["tb_testing_end_time"];
        let offline_timeoffset = startTestArgsObj["offline_timeoffset"];
        if(endTimeStr && endTimeStr != ""){
            endTimeStr = endTimeStr.replace(/[-]/ig,"/");
            //定时停止
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
        // else if(data.field["switch_random_offline"] == "on" && offline_timeoffset >= 300){
        //     //模拟每隔一段时间全部用户断线，之后停止两分钟后，全部用户上线的操作
        //     autoStopId = setTimeout(function(){
        //         //自动停止
        //         onStopTestingClick(null);
        //         //终止服务
        //         let obj = {"cmd":0xff000006};
        //         for(key in dataProviderWebSocketArr){
        //             if(dataProviderWebSocketArr[key] && dataProviderWebSocketArr[key].isConnected == true){
        //                 sendWebSocketMsg(dataProviderWebSocketArr[key],JSON.stringify(obj));
        //             }
        //         }
        //         //延时一段时间后，重新启动压测用例
        //         let tmpStartId = setTimeout(function(){
        //             clearTimeout(tmpStartId)
        //             //定时开启
        //             onStartTestingClick(data)
        //         },120000);
        //     },offline_timeoffset * 1000)
        // }
        return false;
}

//当点击停止测试
function onStopTestingClick(evt){
    if(autoStopId > -1)
        clearTimeout(autoStopId)
    autoStopId = -1
    // if(dataProviderWebSocketArr.length > 0){
    //     layer.msg("压测服务器已断开，请稍后重试...")
    //     return;
    // }
    layer.msg('压测已停止')
    if(isTestingState == true){
        $("#formStart").removeClass();
        $("#formStart").addClass("layui-btn")
        $("#formStop").removeClass();
        $("#formStop").addClass("layui-btn layui-btn-primary")
      let obj = {"cmd":0xff000002};
      for(key in dataProviderWebSocketArr){
        if(dataProviderWebSocketArr[key] && dataProviderWebSocketArr[key].isConnected == true){
            dataProviderWebSocketArr[key].isTesting = false;
            sendWebSocketMsg(dataProviderWebSocketArr[key],JSON.stringify(obj));
        }
      }
    }
    for(key in testingResultMap){
        testingResultMap[key] = null;//清空缓存的压测结果数据
    }
    isTestingState = false;
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
function createWebSocketConn(config,id){
    let ws = new WebSocket(config.fullPath);
    ws.id = id;
    ws.isConnected = false;
    ws.isTesting = false;
    ws.heartbeatID = -1;
    ws.onopen = function(){
        ser_count ++;
        document.getElementById("ser_count").innerHTML = ser_count + ""
        console.log("ws服务:"+config.webSocketHost+"连接成功")
        //延迟十秒后，取ws的最终状态， 根据最终状态决定是否需要启动测试
        setTimeout(()=>{
            if(isTestingState == true && ws.isTesting == false){
                ws.isTesting = true;
                //如果此时处于测试服务已启动状态，则直接通知服务器开始测试
                startTestArgsObj.sevID = ws.id;
                startTestArgs = JSON.stringify(startTestArgsObj)
                sendWebSocketMsg(ws,startTestArgs);
            }
        },10000);
        //启动心跳
        ws.heartbeatID = setInterval(function(){
            let obj = {"cmd":0xff000003};
            sendWebSocketMsg(ws,JSON.stringify(obj));
        },50000)
        ws.isConnected = true;
    }
    ws.onclose = function(){
        ws.isConnected = false;
        ws.isTesting = false;
        document.getElementById("ser_count").innerHTML = ser_count + ""
        console.log("ws服务:"+config.webSocketHost+"连接断开")
        if(ws.heartbeatID > -1){
            //停止心跳
            clearInterval(ws.heartbeatID);
            ws.heartbeatID = -1;
            ser_count --;
        }
        testingResultMap[ws.id] = null;
        // if(onCloseCallBackFunc != null){
        //     //调用socket 关闭回调
        //     onCloseCallBackFunc()
        // }
        //断线重连
        console.log("websocket已断开，正在重连中")
        setTimeout(function(){
            dataProviderWebSocketArr[id] = createWebSocketConn(config,id)
        },10000)//一定时间后，尝试重连
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
                    pushTestingResult(pkg,ws.id)//将数据存入缓冲区，并且打印
                    break;
                    case 0xff000000:
                        //收到了服务器返回的初始化信令
                        let stat = pkg.isRunning
                        if(stat == true){
                            //压测已经启动，改变按钮状态
                            isTestingState = true;
                            ws.isTesting = true;
                            $("#formStart").removeClass();
                            $("#formStart").addClass("layui-btn layui-btn-primary")
                            $("#formStop").removeClass();
                            $("#formStop").addClass("layui-btn")
                        }
                        break;
                    case 0xff000005:
                        //收到了启动状态回执
                        let runStat = pkg.isRunning
                        if(runStat == false){
                            //压测程序未启动成功
                            isTestingState = false;
                            ws.isTesting = false;
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

function pushTestingResult(pkg,id){
    testingResultMap[id] = pkg;
    //更新屏显
    makeTestingResultAndPrint()
}

/**
 * 将压测数据json，转换为字符串
 * 
*/
function makeTestingResultAndPrint(){
    // let datatime = pkg.Nowtime || 0;
    // let timeStr = ""
    // if(datatime != 0){
    //     timeStr = dateFormat("HH:MM:SS",new Date(datatime*1000))
    // }
    let timeStr = dateFormat("HH:MM:SS",new Date())
    let msg = "";
    let Cur_user_count = 0;
    let Cur_sessionCount = 0
    let Concurrency_req_per_second = 0.0;
    let Concurrency_complete_per_second = 0.0
    //let Success_rate_five_second = 0;
    let UdpReqCount_per_second = 0
    let UdpRecivedCount_per_second = 0;

    for(key in testingResultMap){
        let pkg = testingResultMap[key]
        if(pkg){
            Cur_user_count += pkg.Cur_user_count
            Cur_sessionCount += pkg.Cur_sessionCount
            Concurrency_req_per_second += pkg.Concurrency_req_per_second;
            Concurrency_complete_per_second += pkg.Concurrency_complete_per_second
            //Success_rate_five_second += pkg.Success_rate_five_second;
            UdpReqCount_per_second += pkg.UdpReqCount_per_second;
            UdpRecivedCount_per_second += pkg.UdpRecivedCount_per_second
        }
    }
    msg += "当前并发用户数: " + Cur_user_count + ",  "
    if(Cur_sessionCount > 0){
        msg += "当前会话数: " + Cur_sessionCount + ",  "
    }
    msg += "信令req: " + Concurrency_req_per_second + "/s,  "
    msg += "信令res: " + Concurrency_complete_per_second + "/s,  "
    //msg += "每秒心跳: " + pkg.HeartBeatCount_per_second + ",  "
    //msg += "信令每5秒响应比" + (parseFloat(Success_rate_five_second) * 100).toFixed(2) + "%,  "
    msg += "UDP发包数: " + UdpReqCount_per_second + "/s,  "
    msg += "UDP收包数: " + UdpRecivedCount_per_second + "/s"
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
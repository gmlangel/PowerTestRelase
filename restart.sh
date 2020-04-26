#!/bin/bash

while true

do

	sudo ps -ef | grep "appMain" | grep -v "grep"

	if [ "$?" -eq 1 ]

	then

		sudo ./run.sh #启动应用，修改成自己的启动应用脚本或命令

		echo "appMain has been restarted!"

	else

		echo "appMain already started!"

	fi

	sleep 10

done
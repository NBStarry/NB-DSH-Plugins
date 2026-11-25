import {spawn} from 'node:child_process';
// Fixed AppleScript; challenge is sent on stdin, not argv, shell, clipboard or logs.
export async function showLocal({taskId,code,expiresAt}){if(process.platform!=='darwin'||!/^[a-f0-9-]{36}$/.test(taskId)||!/^[-_A-Za-z0-9]{32}$/.test(code))return false;
 const seconds=Math.min(120,Math.floor((expiresAt-Date.now())/1000));if(!(seconds>0))return false;
 const script=`set r to display dialog "任务 ${taskId}：授权仅一次向本人 QQ 询问：这两天按什么口径出周报？选项：合计 / 日均。若同意，请本人在已绑定机器人私聊输入：总管核对 ${code}，然后点一次授权。" buttons {"取消", "一次授权"} default button "取消" cancel button "取消" giving up after ${seconds}\nreturn (not gave up of r) and (button returned of r is "一次授权")`;
 return new Promise(resolve=>{const p=spawn('/usr/bin/osascript',['-'],{stdio:['pipe','pipe','ignore'],env:{PATH:'/usr/bin:/bin'},timeout:(seconds+3)*1000});let out='';p.stdout.on('data',x=>out=(out+x).slice(-32));p.stdin.on('error',()=>{});p.on('error',()=>resolve(false));p.on('close',n=>resolve(n===0&&out.trim()==='true'));p.stdin.end(script)});
}

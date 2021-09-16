import { ProgressIndicator, Separator, Dialog, PrimaryButton } from '@fluentui/react';
import { useState } from 'react';

import { withDisplayName } from '../utils';
import { useAdbDevice } from './type';

const shell_data = `#!/system/bin/sh
killall minitouch.agent >/dev/null 2>&1
export APK=$(pm path xyz.imxqd.clickclick| cut -c 9-)
echo $APK
export CLASSPATH="$APK"
exec nohup app_process /system/bin xyz.imxqd.adb.stf.MinitouchAgent > /dev/null 2>&1
`;

const sleep = function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
};
export const DeviceInfo = withDisplayName('DeviceInfo')((): JSX.Element | null => {
    const device = useAdbDevice();
    const [activing, setActiving] = useState(false);

    return (
        <>
            <span>
                <span>协议版本: </span>
                <code>{device?.protocolVersion?.toString(16).padStart(8, '0')}</code>
            </span>
            <Separator />
            <span>设备型号: {device?.model}</span>
            <Separator />
            <span>设备名称: {device?.device}</span>
            <Separator />
            <PrimaryButton disabled={!device} onClick={async ()=>{
                
                try {
                    const PROCESS_NAME = 'minitouch.agent';
                    let pid = await device?.childProcess.exec('pidof', PROCESS_NAME);
                    if (pid) {
                        alert('服务已存在');
                        return;
                    }
                    setActiving(true);
                    const sync = await device?.sync();
                    var buf = new ArrayBuffer(shell_data.length * 2); // 2 bytes for each char
                    var bufView = new Uint16Array(buf);
                    for (var i=0, strLen=shell_data.length; i<strLen; i++) {
                        bufView[i] = shell_data.charCodeAt(i);
                    }
                    await sync?.write('/data/local/tmp/clickclick.sh', buf, 0o0777);
                    sync?.dispose();
                    let output = await device?.childProcess.spawn('/data/local/tmp/clickclick.sh');
                    // let output = await device?.childProcess.exec('/data/local/tmp/clickclick.sh');
                    // console.log(output);
                    output?.onStdout((data => {
                        console.log(String.fromCharCode.apply(null, Array.from(new Uint8Array(data))));
                    }));
                    output?.onStderr((data => {
                        console.error(String.fromCharCode.apply(null, Array.from(new Uint8Array(data))));
                    }));
                    const startTime = Date.now();
                    console.log('waiting for minitouch.agent ...');
                    while(true) {
                        await sleep(1000);
                        let pid = await device?.childProcess.exec('pidof', PROCESS_NAME);
                        if (pid) {
                            break;
                        } else {
                            if (Date.now() - startTime > 20 * 1000) {
                                alert('服务激活失败(超时)!');
                                return;
                            }
                        }
                    }
                    alert('服务已激活');
                } catch(e) {
                    alert('服务激活失败!');
                } finally {
                    setActiving(false);
                }
            }}>开始激活</PrimaryButton>
            <PrimaryButton disabled={!device} onClick={async ()=>{
                
                try {
                    await device?.childProcess.exec('killall', 'minitouch.agent');
                } catch(e) {
                } finally {
                    alert('服务已关闭');
                }
            }}>关闭服务</PrimaryButton>
            
            <Dialog
                hidden={!activing}
                dialogContentProps={{
                    title: '正在激活...'
                }}
            >
                <ProgressIndicator />
            </Dialog>
        </>
    );
});

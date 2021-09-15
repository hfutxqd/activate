import { DefaultButton, Dialog, Dropdown, IDropdownOption, PrimaryButton, ProgressIndicator, Stack, StackItem, TooltipHost } from '@fluentui/react';
import { Adb, AdbBackend, AdbLogger } from '@yume-chan/adb';
import AdbWebUsbBackend, { AdbWebCredentialStore, AdbWebUsbBackendWatcher } from '@yume-chan/adb-backend-webusb';
import AdbWsBackend from '@yume-chan/adb-backend-ws';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CommonStackTokens } from '../styles';
import { withDisplayName } from '../utils';
import { ErrorDialogContext } from './error-dialog';

const DropdownStyles = { dropdown: { width: '100%' } };

interface ConnectProps {
    device: Adb | undefined;

    logger?: AdbLogger;

    onDeviceChange: (device: Adb | undefined) => void;
}

const CredentialStore = new AdbWebCredentialStore();

export const Connect = withDisplayName('Connect')(({
    device,
    logger,
    onDeviceChange,
}: ConnectProps): JSX.Element | null => {
    const supported = AdbWebUsbBackend.isSupported();

    const { show: showErrorDialog } = useContext(ErrorDialogContext);

    const [selectedBackend, setSelectedBackend] = useState<AdbBackend | undefined>();
    const [connecting, setConnecting] = useState(false);

    const [usbBackendList, setUsbBackendList] = useState<AdbBackend[]>([]);
    const updateUsbBackendList = useCallback(async () => {
        const backendList: AdbBackend[] = await AdbWebUsbBackend.getDevices();
        setUsbBackendList(backendList);
        return backendList;
    }, []);
    useEffect(() => {
        if (!supported) {
            showErrorDialog('你的浏览器不支持WebUSB。\n\n请使用最新版本Chrome(Windows, macOS, Linux和Android), Microsoft Edge (Windows和macOS)。 其它基于Chromium的浏览器可能也能正常工作。');
            return;
        }

        updateUsbBackendList();

        const watcher = new AdbWebUsbBackendWatcher(async (serial?: string) => {
            const list = await updateUsbBackendList();

            if (serial) {
                setSelectedBackend(list.find(backend => backend.serial === serial));
                return;
            }
        });
        return () => watcher.dispose();
    }, []);

    const [wsBackendList, setWsBackendList] = useState<AdbBackend[]>([]);
    useEffect(() => {
        const intervalId = setInterval(async () => {
            if (connecting || device) {
                return;
            }

            const wsBackend = new AdbWsBackend("ws://localhost:15555");
            try {
                await wsBackend.connect();
                setWsBackendList([wsBackend]);
                setSelectedBackend(wsBackend);
            } catch {
                setWsBackendList([]);
            } finally {
                await wsBackend.dispose();
            }
        }, 5000);

        return () => {
            clearInterval(intervalId);
        };
    }, [connecting, device]);

    const handleSelectedBackendChange = (
        _e: React.FormEvent<HTMLDivElement>,
        option?: IDropdownOption,
    ) => {
        setSelectedBackend(option?.data as AdbBackend);
    };

    const requestAccess = useCallback(async () => {
        const backend = await AdbWebUsbBackend.requestDevice();
        setSelectedBackend(backend);
        await updateUsbBackendList();
    }, []);

    const connect = useCallback(async () => {
        try {
            if (selectedBackend) {
                const device = new Adb(selectedBackend, logger);
                try {
                    setConnecting(true);
                    await device.connect(CredentialStore);
                    onDeviceChange(device);
                } catch (e) {
                    device.dispose();
                    throw e;
                }
            }
        } catch (e: any) {
            showErrorDialog(e.message);
        } finally {
            setConnecting(false);
        }
    }, [selectedBackend, logger, onDeviceChange]);
    const disconnect = useCallback(async () => {
        try {
            await device!.dispose();
            onDeviceChange(undefined);
        } catch (e: any) {
            showErrorDialog(e.message);
        }
    }, [device]);
    useEffect(() => {
        return device?.onDisconnected(() => {
            onDeviceChange(undefined);
        });
    }, [device, onDeviceChange]);

    const backendList = useMemo(
        () => ([] as AdbBackend[]).concat(usbBackendList, wsBackendList),
        [usbBackendList, wsBackendList]
    );

    const backendOptions = useMemo(() => {
        return backendList.map(backend => ({
            key: backend.serial,
            text: `${backend.serial} ${backend.name ? `(${backend.name})` : ''}`,
            data: backend,
        }));
    }, [backendList]);

    useEffect(() => {
        setSelectedBackend(old => {
            if (old) {
                const current = backendList.find(backend => backend.serial === old.serial);
                if (current) {
                    return current;
                }
            }

            return backendList.length ? backendList[0] : undefined;
        });
    }, [backendList]);

    return (
        <Stack
            tokens={{ childrenGap: 8, padding: '0 0 8px 8px' }}
        >
            <Dropdown
                disabled={!!device || backendOptions.length === 0}
                label="可连接设备"
                placeholder="无可连接设备"
                options={backendOptions}
                styles={DropdownStyles}
                dropdownWidth={300}
                selectedKey={selectedBackend?.serial}
                onChange={handleSelectedBackendChange}
            />

            {!device ? (
                <Stack horizontal tokens={CommonStackTokens}>
                    <StackItem grow shrink>
                        <PrimaryButton
                            text="连接设备"
                            disabled={!selectedBackend}
                            primary={!!selectedBackend}
                            styles={{ root: { width: '100%' } }}
                            onClick={connect}
                        />
                    </StackItem>
                    <StackItem grow shrink>
                        <TooltipHost
                            content="未经您的明确许可，无法连接到任何设备。"
                        >
                            <DefaultButton
                                text="添加设备"
                                disabled={!supported}
                                primary={!selectedBackend}
                                styles={{ root: { width: '100%' } }}
                                onClick={requestAccess}
                            />
                        </TooltipHost>
                    </StackItem>
                </Stack>
            ) : (
                <DefaultButton text="断开连接" onClick={disconnect} />
            )}

            <Dialog
                hidden={!connecting}
                dialogContentProps={{
                    title: '正在连接...',
                    subText: '请运行设备上的调试许可'
                }}
            >
                <ProgressIndicator />
            </Dialog>
        </Stack>
    );
});

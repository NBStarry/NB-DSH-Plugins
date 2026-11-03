window.__ModuleLoader__.load({
  id: '@local/dsh-mobile-connection',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const namespace = 'mobileConnection';
    const dictionaries = {
      en: {
        title: 'Mobile connection',
        subtitle: 'Your workspace, on your phone.',
        privateAccess: 'TAILSCALE PRIVATE ACCESS',
        statusReady: 'Ready', statusOff: 'Off', statusWorking: 'Connecting', statusAction: 'Action needed', statusUnknown: 'Unavailable', statusChecking: 'Checking',
        stepEntry: 'Private entry', stepTrust: 'Trusted domain', stepPhone: 'Connect phone',
        connectionSteps: 'Connection setup progress',
        setupTitle: 'Set up your private entry',
        setupHelp: 'Use the Tailscale device name for this host. Your phone needs access to the same tailnet.',
        authorityHint: 'Example: device.example.ts.net:18443',
        advanced: 'Advanced settings', advancedHint: 'Socket directory and Tailscale program',
        advancedRequired: 'Complete both advanced settings before enabling.',
        riskDetails: 'Security details',
        enableSummary: 'Runs the selected Tailscale program with host-process permissions and creates a private entry. Authenticated owners can obtain and share a long-lived login link.',
        trustTitle: 'Approve this device domain',
        trustHelp: 'One explicit approval is needed before the private entry can accept connections.',
        trustSummary: 'Writes a complete Connection override, pins inherited settings, and may affect other settings or disconnect active pages.',
        connectTitle: 'Connect your phone',
        connectHelp: 'Open Tailscale on your phone, then scan the code or use the login link.',
        hiddenTitle: 'Your login link stays hidden',
        hiddenHelp: 'Reveal it only when you are ready to connect a trusted device.',
        linkSummary: 'The link grants owner access. Hiding it does not revoke access or clear your clipboard.',
        scanTitle: 'Scan with your phone',
        scanHelp: 'Keep Tailscale connected while using DSH.',
        linkHelp: 'Or copy the link to a trusted browser.',
        loadingLink: 'Preparing your login link…',
        nextStep: 'Next step',
        nextChecking: 'Checking this host’s private connection. No login link is being requested.',
        nextStarting: 'Wait for the private entry to finish starting. This page updates automatically.',
        nextMissing: 'Stop the connection, then complete the device domain and advanced settings.',
        nextFailed: 'Check Tailscale on this host. Stop the connection to review its configuration before trying again.',
        nextUnavailable: 'Reconnect to this host or check that the plugin is enabled. This page checks again automatically.',
        management: 'Connection controls',
        stopDetails: 'What happens when I stop?',
        checking: 'Checking connection status…',
        disabled: 'Mobile connection is disabled.',
        authority: 'Tailscale device DNS name and HTTPS port',
        socketParent: 'Trusted, short absolute directory for the private socket (including safe parent permissions and ACLs)',
        executable: 'Absolute path to the Tailscale executable',
        enableRisk: 'Enabling creates a private Tailscale entry to this instance. The selected executable runs with the DSH host process permissions: choose only a trusted Tailscale program. All authenticated owner browsers can reveal the long-lived owner login link. This does not change Connection trusted hosts; review and confirm that configuration separately. Only continue if you trust the device, network, and directory.',
        confirmEnable: 'I understand and want to enable this private entry.',
        enable: 'Enable mobile connection',
        disable: 'Stop mobile connection',
        stopWarning: 'Stopping closes this private proxy and its own Serve process. It does not revoke existing owner credentials or links.',
        pending: 'Change requested. Waiting for the connection status; a reload may interrupt the response.',
        uncertain: 'The result could not be confirmed. Check the status before trying again; the request may still have been applied.',
        stopWaiting: 'Stop waiting (does not cancel the request)',
        enabledConfirmed: 'The enabled configuration was observed. Check connection status above.',
        disabledConfirmed: 'The disabled configuration was observed. Existing credentials are not revoked.',
        starting: 'Starting the private connection…',
        ready: 'Private connection ready.',
        failed: 'Private connection failed or stopped.',
        stopped: 'Private connection stopped.',
        notConfigured: 'The private connection is missing required configuration.',
        needsTrustedHost: 'The mobile access domain is not yet trusted. Confirm the configuration change first.',
        trustPreview: 'Review trusted domain change',
        trustPreparing: 'Checking the proposed change…',
        trustAuthority: 'Exact mobile authority under review:',
        trustWarning: 'Applying writes a complete Connection profile override based on the currently resolved fields, pinning inherited settings and potentially affecting other settings. It appends only the exact mobile authority shown above. Reloading Connection may interrupt all pages and sessions. Review this impact before confirming.',
        trustConfirm: 'I understand this profile override and possible disconnection and confirm this change.',
        trustApply: 'Apply trusted domain change',
        trustUnchanged: 'The domain is already present in the proposed configuration, but the trust check still rejects it. Check other trust restrictions; no change was applied.',
        trustConflict: 'The configuration changed or the preview expired. Review a new preview before confirming again.',
        trustUnavailable: 'Unable to prepare the trust change. Check the connection and try again.',
        trustPending: 'Change accepted or being processed. Waiting for effective connection status; reloading Connection may interrupt this page.',
        trustUncertain: 'Could not confirm that the change took effect. Reconnect and check the status; if still untrusted, review a new preview.',
        trustEffective: 'The private connection now reports ready.',
        trustCancel: 'Cancel review',
        unavailable: 'Status unavailable. The plugin may be disabled or disconnected.',
        warning: 'This is a long-lived owner login link. Anyone who obtains the link or scans the code can act as the owner, even after this panel is hidden. Show or copy it only in a trusted place. Hiding does not revoke it; clipboard contents may remain.',
        show: 'Show login link and QR code',
        hide: 'Hide and clear',
        copy: 'Copy login link',
        copied: 'Copied. Clear your clipboard when finished.',
        copyFailed: 'Could not copy. You can select the link and copy it manually.',
        revealFailed: 'Could not display the login link. Check the connection and try again.',
        linkLabel: 'Long-lived owner login link',
        qrAlt: 'QR code containing the long-lived owner login link',
      },
      zh: {
        title: '手机连接',
        subtitle: '在手机上，继续你的工作。',
        privateAccess: 'TAILSCALE 私网访问',
        statusReady: '已就绪', statusOff: '已关闭', statusWorking: '连接中', statusAction: '待处理', statusUnknown: '不可用', statusChecking: '检查中',
        stepEntry: '开启私网入口', stepTrust: '确认可信域名', stepPhone: '连接手机',
        connectionSteps: '连接设置进度',
        setupTitle: '设置私网入口',
        setupHelp: '使用这台主机的 Tailscale 设备域名。手机需能访问同一 tailnet。',
        authorityHint: '例如：device.example.ts.net:18443',
        advanced: '高级设置', advancedHint: '套接字目录与 Tailscale 程序',
        advancedRequired: '启用前，请补全高级设置中的两项参数。',
        riskDetails: '安全说明',
        enableSummary: '所选 Tailscale 程序将以宿主进程权限运行，并创建私网入口。已认证的所有者可获取并分享长期登录链接。',
        trustTitle: '确认此设备的可信域名',
        trustHelp: '私网入口开始接受连接前，需要你明确确认这项配置变更。',
        trustSummary: '将写入完整的 Connection 配置覆盖项、固定继承设置，可能影响其他设置并中断各页面连接。',
        connectTitle: '连接你的手机',
        connectHelp: '先在手机上连接 Tailscale，再扫码或使用登录链接。',
        hiddenTitle: '登录信息保持隐藏',
        hiddenHelp: '准备好连接可信设备后，再显示二维码与链接。',
        linkSummary: '此链接授予所有者权限。隐藏不会撤销访问权限，也不会清除剪贴板。',
        scanTitle: '用手机扫码',
        scanHelp: '使用 DSH 期间，请保持 Tailscale 连接。',
        linkHelp: '也可以复制链接，在可信浏览器中打开。',
        loadingLink: '正在准备登录链接…',
        nextStep: '下一步',
        nextChecking: '正在检查这台主机的私网状态，不会请求登录链接。',
        nextStarting: '等待私网入口启动完成，页面会自动更新状态。',
        nextMissing: '先停止连接，再补全设备域名和高级设置。',
        nextFailed: '检查主机上的 Tailscale。可先停止连接，检查配置后重新启用。',
        nextUnavailable: '请重新连接主机，或检查插件是否启用。此页面会自动重试状态检查。',
        management: '连接管理',
        stopDetails: '停止后会怎样？',
        checking: '正在检查连接状态…',
        disabled: '手机连接已关闭。',
        authority: 'Tailscale 设备域名和 HTTPS 端口',
        socketParent: '私有套接字使用的可信短路径绝对目录（含安全的父目录权限及 ACL）',
        executable: 'Tailscale 可执行文件的绝对路径',
        enableRisk: '启用将为此实例创建 Tailscale 私网入口。所选程序将以 DSH 宿主进程权限运行，请仅选择可信的 Tailscale 程序。所有已认证的所有者浏览器均可显示长期所有者登录链接。此操作不会修改 Connection 的可信域名；请另行检查并确认该配置。请仅在信任设备、网络和目录时继续。',
        confirmEnable: '我已了解风险，确认启用此私网入口。',
        enable: '启用手机连接',
        disable: '停止手机连接',
        stopWarning: '停止将关闭此私有代理及其自身的 Serve 进程，但不会撤销现有所有者凭证或链接。',
        pending: '已请求变更，正在等待连接状态；重载可能中断响应。',
        uncertain: '无法确认结果。重试前请检查状态；请求仍可能已生效。',
        stopWaiting: '停止等待（不会取消请求）',
        enabledConfirmed: '已观察到配置为启用，请查看上方连接状态。',
        disabledConfirmed: '已观察到配置为关闭；现有凭证不会被撤销。',
        starting: '正在启动私网连接…',
        ready: '私网连接已就绪。',
        failed: '私网连接失败或已停止。',
        stopped: '私网连接已停止。',
        notConfigured: '私网连接缺少必需的配置。',
        needsTrustedHost: '尚未信任手机访问域名，请先确认配置变更。',
        trustPreview: '预览可信域名变更',
        trustPreparing: '正在检查拟议变更…',
        trustAuthority: '正在预览的精确手机访问域名与端口：',
        trustWarning: '应用将基于当前解析出的字段写入完整的 Connection 配置覆盖项，固定继承设置，并可能影响其他设置。仅追加上方所示的精确手机访问域名与端口。重新加载 Connection 可能中断所有页面和会话。请确认已了解影响。',
        trustConfirm: '我已了解完整配置覆盖和可能的连接中断，确认执行此变更。',
        trustApply: '应用可信域名变更',
        trustUnchanged: '拟议配置中已有该域名，但信任检查仍未通过。请检查其他信任限制；本次没有应用变更。',
        trustConflict: '配置已变更或预览已过期，请重新预览后再确认。',
        trustUnavailable: '无法准备可信域名变更，请检查连接后重试。',
        trustPending: '变更已受理或正在处理，正在等待实际连接状态；Connection 重载可能中断此页面。',
        trustUncertain: '无法确认变更是否生效。请重新连接并检查状态；如仍未信任，请重新预览。',
        trustEffective: '私网连接当前报告已就绪。',
        trustCancel: '取消预览',
        unavailable: '无法获取状态。插件可能已停用或连接已断开。',
        warning: '这是长期有效的所有者登录链接。任何取得链接或扫描二维码的人都能以所有者身份操作，即使此面板已隐藏也一样。仅在可信环境中显示或复制。隐藏不会撤销链接；剪贴板中的内容可能仍会保留。',
        show: '显示登录链接和二维码',
        hide: '隐藏并清除',
        copy: '复制登录链接',
        copied: '已复制。使用后请清除剪贴板。',
        copyFailed: '无法复制，请手动选择并复制链接。',
        revealFailed: '无法显示登录链接，请检查连接后重试。',
        linkLabel: '长期有效的所有者登录链接',
        qrAlt: '包含长期有效所有者登录链接的二维码',
      },
    };
    const styles = `
.mc-root{color:var(--dsw-alias-label-primary);max-width:780px;margin:0 auto;padding:28px 24px 36px;font-size:13px;line-height:1.6;box-sizing:border-box}
.mc-root *{box-sizing:border-box}.mc-root h2,.mc-root h3,.mc-root p{margin:0}.mc-root button,.mc-root input{font:inherit}.mc-root button{appearance:none}
.mc-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:24px}.mc-eyebrow{font-size:10px;letter-spacing:.13em;font-weight:650;color:var(--dsw-alias-label-secondary);margin-bottom:8px!important}.mc-root h2{font-size:24px;font-weight:650;letter-spacing:-.035em;line-height:1.25}.mc-subtitle{margin-top:7px!important;color:var(--dsw-alias-label-secondary)}
.mc-badge{display:inline-flex;flex-shrink:0;align-items:center;gap:7px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:5px 10px;font-size:11px;font-weight:600;margin-top:3px;background:var(--dsw-alias-bg-layer-1)}.mc-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}.mc-badge[data-tone=ready] .mc-dot{background:var(--dsw-alias-state-success-primary)}.mc-badge[data-tone=working] .mc-dot{background:var(--dsw-alias-brand-primary)}.mc-badge[data-tone=attention] .mc-dot{background:var(--dsw-alias-state-warn-primary)}
.mc-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));list-style:none;margin:0 0 24px;padding:0;gap:12px}.mc-step{display:flex;gap:8px;align-items:center;color:var(--dsw-alias-label-secondary);font-size:12px}.mc-step-number{display:grid;place-items:center;width:24px;height:24px;flex-shrink:0;border:1px solid var(--dsw-alias-border-l2);border-radius:50%;font-size:11px}.mc-step[data-current=true]{color:var(--dsw-alias-label-primary);font-weight:600}.mc-step[data-current=true] .mc-step-number{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}.mc-step[data-done=true] .mc-step-number{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.mc-card{border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;margin-top:16px}.mc-card-head{padding:22px 24px 0}.mc-root h3{font-size:15px;font-weight:650;letter-spacing:-.015em}.mc-help{color:var(--dsw-alias-label-secondary);font-size:12px;margin-top:5px!important}.mc-content{padding:20px 24px 24px}.mc-field{display:block;margin-bottom:16px}.mc-label{display:block;font-size:12px;font-weight:600;margin-bottom:7px}.mc-input{display:block;width:100%;min-width:0;min-height:38px;padding:8px 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);outline:none}.mc-input::placeholder{color:var(--dsw-alias-label-secondary)}.mc-input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.mc-input:disabled{opacity:.55}.mc-code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;overflow-wrap:anywhere}
.mc-details{border-top:1px solid var(--dsw-alias-border-l1);padding-top:13px;margin-top:12px}.mc-details summary{cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px;width:fit-content;max-width:100%;padding:3px 0}.mc-details summary:hover{color:var(--dsw-alias-label-primary)}.mc-details summary:focus-visible,.mc-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px;border-radius:5px}.mc-details-body{padding-top:13px}.mc-details-body .mc-field:last-child{margin-bottom:0}.mc-detail-hint{margin-left:8px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.mc-notice{margin-top:18px;padding:13px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-2);font-size:12px;color:var(--dsw-alias-label-secondary)}.mc-notice>.mc-details{border:0;padding:0;margin:5px 0 0}.mc-notice .mc-details-body{padding-top:6px}.mc-confirm{display:flex;align-items:flex-start;gap:9px;margin-top:16px;font-size:12px;cursor:pointer}.mc-confirm input{flex-shrink:0;width:15px;height:15px;margin:3px 0 0;accent-color:var(--dsw-alias-brand-primary)}
.mc-actions{display:flex;flex-wrap:wrap;gap:9px;align-items:center;margin-top:18px}.mc-button{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:8px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px!important;font-weight:550;line-height:1.4;cursor:pointer;transition:background .15s,border-color .15s}.mc-button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-secondary)}.mc-button:disabled{opacity:.45;cursor:not-allowed}.mc-button-primary{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);font-weight:650}.mc-button-primary:hover:not(:disabled){background:var(--dsw-alias-bg-overlay);border-color:var(--dsw-alias-brand-primary)}.mc-button-quiet{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary)}
.mc-empty{display:flex;align-items:center;gap:18px;padding:22px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base)}.mc-device{width:40px;height:52px;flex-shrink:0;color:var(--dsw-alias-label-secondary)}.mc-empty-title{font-size:13px;font-weight:600}.mc-empty .mc-actions{margin-top:14px}.mc-qr-layout{display:grid;grid-template-columns:208px minmax(0,1fr);align-items:center;gap:24px}.mc-qr{display:block;width:208px;max-width:100%;height:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:10px}.mc-qr-info{min-width:0}.mc-qr-info .mc-field{margin-top:17px;margin-bottom:0}.mc-qr-info .mc-input{font-size:11px}.mc-host{margin-top:12px!important;color:var(--dsw-alias-label-secondary);font-size:11px;overflow-wrap:anywhere}.mc-feedback{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:12px!important;overflow-wrap:anywhere}.mc-next{display:flex;gap:12px;align-items:flex-start}.mc-next-index{font-size:20px;color:var(--dsw-alias-label-secondary);line-height:1.1}.mc-domain{display:block;margin-top:9px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base)}
.mc-footer{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:20px 0 0;margin-top:20px;border-top:1px solid var(--dsw-alias-border-l1)}.mc-footer .mc-details{border:0;padding:0;margin:3px 0 0}.mc-footer-copy{min-width:0}.mc-footer-title{font-size:12px;font-weight:600}.mc-footer .mc-button{flex-shrink:0}.mc-footer .mc-details-body{max-width:480px;color:var(--dsw-alias-label-secondary);font-size:12px}
@media(max-width:620px){.mc-root{padding:20px 16px 28px}.mc-header{gap:10px}.mc-root h2{font-size:22px}.mc-steps{gap:7px}.mc-step{font-size:11px;align-items:flex-start}.mc-step-number{width:21px;height:21px}.mc-card-head{padding:18px 18px 0}.mc-content{padding:17px 18px 20px}.mc-detail-hint{display:block;margin-left:0}.mc-qr-layout{grid-template-columns:1fr;gap:20px}.mc-qr{width:220px;justify-self:center}.mc-empty{padding:18px;gap:14px}.mc-device{width:30px;height:42px}}
@media(prefers-reduced-motion:reduce){.mc-button{transition:none}}
`;
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(namespace, dictionaries), 'mobile-connection: translations');
        const t = ctx.locale.bind(namespace);
        function Status() {
          React.useSyncExternalStore(callback => ctx.locale.subscribe(callback), () => ctx.locale.getSnapshot());
          const [status, setStatus] = React.useState('checking');
          const [secret, setSecret] = React.useState(null);
          const [busy, setBusy] = React.useState(false);
          const [message, setMessage] = React.useState('');
          const [enabled, setEnabled] = React.useState(null);
          const [authority, setAuthority] = React.useState('');
          const [socketParent, setSocketParent] = React.useState('');
          const [executable, setExecutable] = React.useState('');
          const [confirmed, setConfirmed] = React.useState(false);
          const [desired, setDesired] = React.useState(null);
          const [configMessage, setConfigMessage] = React.useState('');
          const [trustPhase, setTrustPhase] = React.useState('idle');
          const [trustPreview, setTrustPreview] = React.useState(null);
          const [trustConfirmed, setTrustConfirmed] = React.useState(false);
          const mounted = React.useRef(false);
          const revealRequest = React.useRef(null);
          const statusRequest = React.useRef(null);
          const configRequest = React.useRef(null);
          const desiredRef = React.useRef(null);
          const prefilled = React.useRef(false);
          const observed = React.useRef(null);
          const trustRequest = React.useRef(null);
          const trustPreviewRef = React.useRef(null);
          const trustPending = React.useRef(false);
          const trustTimer = React.useRef(null);
          const generation = React.useRef(0);
          const clearTrustPreview = () => {
            trustRequest.current?.abort();
            trustRequest.current = null;
            trustPreviewRef.current = null;
            clearTimeout(trustTimer.current);
            trustTimer.current = null;
            if (mounted.current) { setTrustPreview(null); setTrustConfirmed(false); }
          };
          const clearSecret = () => {
            generation.current++;
            revealRequest.current?.abort();
            revealRequest.current = null;
            if (mounted.current) { setSecret(null); setBusy(false); setMessage(''); }
          };
          React.useEffect(() => {
            mounted.current = true;
            const check = async () => {
              if (document.visibilityState === 'hidden') return;
              statusRequest.current?.abort();
              const controller = new AbortController();
              statusRequest.current = controller;
              try {
                const response = await fetch('api/mobile-connection/status', {
                  method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
                });
                if (!response.ok) throw new Error('unavailable');
                const value = await response.json();
                if (controller.signal.aborted || !mounted.current) return;
                const next = value?.state === 'ready' && value.available === true ? 'ready'
                  : value?.state === 'disabled' && value.connectionEnabled === false ? 'disabled'
                    : value?.state === 'starting' ? 'starting'
                    : value?.state === 'failed' ? 'failed'
                      : value?.state === 'stopped' ? 'stopped'
                        : value?.state === 'needs-trusted-host' ? 'needsTrustedHost'
                          : value?.state === 'not-configured' && value.available === false ? 'notConfigured' : 'unavailable';
                setStatus(next);
                observed.current = { state: next, enabled: value?.connectionEnabled === true, authority: typeof value?.authority === 'string' ? value.authority : '' };
                if (trustPending.current && next === 'ready' && value?.available === true && observed.current.enabled && observed.current.authority === trustPending.current) {
                  trustPending.current = false;
                  clearTrustPreview();
                  setTrustPhase('effective');
                } else if (!trustPending.current && (trustRequest.current || trustPreviewRef.current) &&
                  (next !== 'needsTrustedHost' || !observed.current.enabled || (trustPreviewRef.current && trustPreviewRef.current.authority !== observed.current.authority))) {
                  clearTrustPreview();
                  setTrustPhase('idle');
                }
                if (typeof value?.connectionEnabled === 'boolean') {
                  setEnabled(value.connectionEnabled);
                  if (!prefilled.current) {
                    setAuthority(typeof value.authority === 'string' ? value.authority : '');
                    setSocketParent(typeof value.socketParent === 'string' ? value.socketParent : '');
                    setExecutable(typeof value.tailscaleExecutable === 'string' ? value.tailscaleExecutable : '');
                    prefilled.current = true;
                  }
                  if (desiredRef.current !== null && value.connectionEnabled === desiredRef.current) {
                    setConfigMessage(value.connectionEnabled ? 'enabledConfirmed' : 'disabledConfirmed');
                    desiredRef.current = null;
                    setDesired(null);
                    setConfirmed(false);
                  }
                } else setEnabled(null);
                if (next !== 'ready') clearSecret();
              } catch {
                if (!controller.signal.aborted && mounted.current) {
                  setStatus('unavailable'); setEnabled(null); observed.current = null; clearSecret();
                  if (!trustPending.current && (trustRequest.current || trustPreviewRef.current)) { clearTrustPreview(); setTrustPhase('idle'); }
                }
              }
            };
            const visibility = () => {
              if (document.visibilityState === 'hidden') {
                statusRequest.current?.abort(); observed.current = null; clearSecret();
                if (!trustPending.current) { clearTrustPreview(); setTrustPhase('idle'); }
              } else void check();
            };
            const pageHide = () => {
              statusRequest.current?.abort(); observed.current = null; clearSecret();
              if (!trustPending.current) { clearTrustPreview(); setTrustPhase('idle'); }
            };
            document.addEventListener('visibilitychange', visibility);
            window.addEventListener('pagehide', pageHide);
            void check();
            const timer = setInterval(() => { void check(); }, 5000);
            return () => {
              mounted.current = false;
              clearInterval(timer); statusRequest.current?.abort(); configRequest.current?.abort(); clearTrustPreview();
              document.removeEventListener('visibilitychange', visibility);
              window.removeEventListener('pagehide', pageHide);
              clearSecret();
            };
          }, []);
          const configure = async connectionEnabled => {
            if (enabled === null || desiredRef.current !== null || (connectionEnabled && (!confirmed || !authority.trim() || !socketParent.trim() || !executable.trim()))) return;
            clearSecret();
            const trustWasPending = Boolean(trustPending.current);
            trustPending.current = false;
            clearTrustPreview();
            setTrustPhase(trustWasPending ? 'uncertain' : 'idle');
            statusRequest.current?.abort();
            desiredRef.current = connectionEnabled;
            setDesired(connectionEnabled);
            setConfigMessage('pending');
            const controller = new AbortController();
            configRequest.current = controller;
            const timeout = setTimeout(() => controller.abort(), 10000);
            const body = connectionEnabled
              ? { connectionEnabled: true, authority: authority.trim(), socketParent: socketParent.trim(), tailscaleExecutable: executable.trim(), confirmed: true }
              : { connectionEnabled: false };
            try {
              const response = await fetch('api/mobile-connection/configure', {
                method: 'POST', credentials: 'same-origin', cache: 'no-store',
                headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal,
              });
              if ((!response.ok || response.status !== 202) && mounted.current && configRequest.current === controller && desiredRef.current === connectionEnabled) setConfigMessage('uncertain');
            } catch {
              // Reloads, aborts, and network failures cannot establish whether the write happened.
              if (mounted.current && configRequest.current === controller && desiredRef.current === connectionEnabled) setConfigMessage('uncertain');
            } finally {
              clearTimeout(timeout);
              if (configRequest.current === controller) configRequest.current = null;
            }
          };
          const stopWaiting = () => {
            desiredRef.current = null;
            setDesired(null);
            setConfirmed(false);
            setConfigMessage('uncertain');
          };
          const previewTrust = async () => {
            const snapshot = observed.current;
            if (!snapshot || snapshot.state !== 'needsTrustedHost' || !snapshot.enabled || !snapshot.authority || desiredRef.current !== null || trustPending.current) return;
            clearTrustPreview();
            setTrustPhase('preparing');
            const controller = new AbortController();
            trustRequest.current = controller;
            const timeout = setTimeout(() => controller.abort(), 10000);
            try {
              const response = await fetch('api/mobile-connection/trust/preview', {
                method: 'POST', credentials: 'same-origin', cache: 'no-store',
                headers: { 'content-type': 'application/json' }, body: '{}', signal: controller.signal,
              });
              if (!response.ok) throw new Error('unavailable');
              const value = await response.json();
              if (!mounted.current || trustRequest.current !== controller || controller.signal.aborted) return;
              const now = observed.current;
              if (!now || now.state !== 'needsTrustedHost' || !now.enabled || now.authority !== snapshot.authority ||
                  value?.authority !== snapshot.authority || !['add', 'unchanged'].includes(value.change) ||
                  typeof value.revision !== 'string' || !value.revision.length || value.revision.length > 256 ||
                  !Number.isFinite(value.expiresInMs) || value.expiresInMs <= 0) throw new Error('unavailable');
              const ttl = Math.min(50000, value.expiresInMs);
              const preview = { authority: value.authority, change: value.change, revision: value.revision, expiresAt: Date.now() + ttl };
              trustPreviewRef.current = preview;
              setTrustPreview({ authority: preview.authority, change: preview.change });
              setTrustConfirmed(false);
              setTrustPhase(value.change === 'unchanged' ? 'unchanged' : 'review');
              trustTimer.current = setTimeout(() => {
                if (trustPreviewRef.current === preview && mounted.current) { clearTrustPreview(); setTrustPhase('conflict'); }
              }, ttl);
            } catch {
              if (mounted.current && trustRequest.current === controller) setTrustPhase('unavailable');
            } finally {
              clearTimeout(timeout);
              if (trustRequest.current === controller) trustRequest.current = null;
            }
          };
          const applyTrust = async () => {
            const preview = trustPreviewRef.current, now = observed.current;
            if (!preview || !trustConfirmed || preview.change !== 'add' || trustPending.current || desiredRef.current !== null ||
                !now || now.state !== 'needsTrustedHost' || !now.enabled || now.authority !== preview.authority) return;
            if (Date.now() >= preview.expiresAt) { clearTrustPreview(); setTrustPhase('conflict'); return; }
            statusRequest.current?.abort();
            clearTrustPreview();
            trustPending.current = preview.authority;
            setTrustPhase('pending');
            const controller = new AbortController();
            trustRequest.current = controller;
            trustTimer.current = setTimeout(() => {
              if (mounted.current && trustPending.current === preview.authority) {
                trustPending.current = false; clearTrustPreview(); setTrustPhase('uncertain');
              }
            }, 60000);
            try {
              const response = await fetch('api/mobile-connection/trust/apply', {
                method: 'POST', credentials: 'same-origin', cache: 'no-store',
                headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revision: preview.revision, confirmed: true }), signal: controller.signal,
              });
              if (!mounted.current || trustRequest.current !== controller || !trustPending.current) return;
              if (response.status === 409) {
                trustPending.current = false; clearTrustPreview(); setTrustPhase('conflict');
              } else if (!response.ok || response.status !== 202) setTrustPhase('uncertain');
            } catch {
              if (mounted.current && trustRequest.current === controller && trustPending.current) setTrustPhase('uncertain');
            } finally {
              if (trustRequest.current === controller) trustRequest.current = null;
            }
          };
          const cancelTrust = () => { clearTrustPreview(); setTrustPhase('idle'); };
          const reveal = async () => {
            if (status !== 'ready' || busy || desiredRef.current !== null || document.visibilityState === 'hidden') return;
            clearSecret();
            const current = generation.current;
            const controller = new AbortController(); revealRequest.current = controller;
            setBusy(true);
            try {
              const response = await fetch('api/mobile-connection/reveal', {
                method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
              });
              if (!response.ok) throw new Error('unavailable');
              const value = await response.json();
              if (typeof value?.url !== 'string' || value.url.length > 8192 || !value.url.startsWith('https://') ||
                  typeof value.qrSvg !== 'string' || value.qrSvg.length > 1024 * 1024 || !value.qrSvg.startsWith('<svg')) throw new Error('unavailable');
              if (!mounted.current || controller.signal.aborted || current !== generation.current || document.visibilityState === 'hidden') return;
              setSecret({ url: value.url, qr: `data:image/svg+xml,${encodeURIComponent(value.qrSvg)}` });
            } catch {
              if (mounted.current && !controller.signal.aborted && current === generation.current) setMessage('revealFailed');
            } finally {
              if (mounted.current && current === generation.current) { revealRequest.current = null; setBusy(false); }
            }
          };
          const copy = async () => {
            if (!secret) return;
            const current = generation.current;
            try {
              await navigator.clipboard.writeText(secret.url);
              if (mounted.current && current === generation.current) setMessage('copied');
            } catch {
              if (mounted.current && current === generation.current) setMessage('copyFailed');
            }
          };
          const isReady = status === 'ready';
          const badge = isReady ? ['statusReady', 'ready'] : status === 'disabled' || status === 'stopped' ? ['statusOff', 'idle']
            : status === 'checking' ? ['statusChecking', 'working'] : status === 'starting' ? ['statusWorking', 'working']
              : status === 'unavailable' ? ['statusUnknown', 'idle'] : ['statusAction', 'attention'];
          const step = isReady ? 3 : status === 'needsTrustedHost' ? 2 : 1;
          const action = (key, name, onClick, disabled = false, primary = false) => h('button', {
            type: 'button', 'data-action': name, onClick, disabled,
            className: `mc-button${primary ? ' mc-button-primary' : ''}`,
          }, t(key));
          const feedback = key => key && h('p', { className: 'mc-feedback', role: 'status' }, t(key));
          const details = (summary, body) => h('details', { className: 'mc-details' }, h('summary', null, t(summary)), h('div', { className: 'mc-details-body' }, body));
          const risk = (summary, full) => h('div', { className: 'mc-notice' }, h('p', null, t(summary)), details('riskDetails', h('p', null, t(full))));
          const field = (key, name, value, update, hint) => h('label', { className: 'mc-field' },
            h('span', { className: 'mc-label' }, t(key)),
            h('input', { className: 'mc-input mc-code', type: 'text', 'data-field': name, value, disabled: desired !== null, onChange: event => update(event.target.value), autoComplete: 'off', autoCapitalize: 'none', spellCheck: false }),
            hint && h('p', { className: 'mc-help' }, t(hint)),
          );
          const phone = h('svg', { className: 'mc-device', viewBox: '0 0 40 52', fill: 'none', 'aria-hidden': true },
            h('rect', { x: 7, y: 2, width: 26, height: 48, rx: 6, stroke: 'currentColor', strokeWidth: 1.5 }),
            h('path', { d: 'M16 7h8M17 44h6', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
            h('path', { d: 'm14 25 4 4 8-9', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
          );
          return h('div', { className: 'mc-root', 'data-testid': 'mobile-connection-panel' },
            h('style', null, styles),
            h('header', { className: 'mc-header' },
              h('div', null, h('p', { className: 'mc-eyebrow' }, t('privateAccess')), h('h2', null, t('title')), h('p', { className: 'mc-subtitle' }, t('subtitle'))),
              h('span', { className: 'mc-badge', 'data-tone': badge[1], role: 'status' }, h('span', { className: 'mc-dot', 'aria-hidden': true }), t(badge[0])),
            ),
            h('ol', { className: 'mc-steps', 'aria-label': t('connectionSteps') },
              ...['stepEntry', 'stepTrust', 'stepPhone'].map((key, i) => h('li', { key, className: 'mc-step', 'data-current': step === i + 1, 'data-done': step > i + 1, 'aria-current': step === i + 1 ? 'step' : undefined },
                h('span', { className: 'mc-step-number', 'aria-hidden': true }, step > i + 1 ? '✓' : String(i + 1)), h('span', null, t(key)))),
            ),
            enabled === false && h('section', { className: 'mc-card', 'data-testid': 'connection-setup' },
              h('div', { className: 'mc-card-head' }, h('h3', null, t('setupTitle')), h('p', { className: 'mc-help' }, t('setupHelp'))),
              h('div', { className: 'mc-content' },
                field('authority', 'authority', authority, setAuthority, 'authorityHint'),
                h('details', { className: 'mc-details', 'data-testid': 'advanced-settings' },
                  h('summary', null, t('advanced'), h('span', { className: 'mc-detail-hint' }, t('advancedHint'))),
                  h('div', { className: 'mc-details-body' }, field('socketParent', 'socket-parent', socketParent, setSocketParent), field('executable', 'executable', executable, setExecutable))),
                (!socketParent.trim() || !executable.trim()) && h('p', { className: 'mc-help' }, t('advancedRequired')),
                risk('enableSummary', 'enableRisk'),
                h('label', { className: 'mc-confirm' }, h('input', { type: 'checkbox', 'data-field': 'confirm-enable', checked: confirmed, disabled: desired !== null, onChange: event => setConfirmed(event.target.checked) }), h('span', null, t('confirmEnable'))),
                h('div', { className: 'mc-actions' }, action('enable', 'enable', () => configure(true), desired !== null || !confirmed || !authority.trim() || !socketParent.trim() || !executable.trim(), true)),
              ),
            ),
            (status === 'needsTrustedHost' || trustPreview || trustPhase === 'preparing') && h('section', { className: 'mc-card', 'data-testid': 'connection-trust' },
              h('div', { className: 'mc-card-head' }, h('h3', null, t('trustTitle')), h('p', { className: 'mc-help' }, t('trustHelp'))),
              h('div', { className: 'mc-content' },
                status === 'needsTrustedHost' && enabled === true && desired === null && !trustPending.current && !trustPreview && trustPhase !== 'preparing' &&
                  action('trustPreview', 'trust-preview', previewTrust, false, true),
                trustPhase === 'preparing' && feedback('trustPreparing'),
                trustPreview && h('div', null,
                  h('p', { className: 'mc-help' }, t('trustAuthority')),
                  h('strong', { className: 'mc-domain mc-code' }, trustPreview.authority),
                  trustPreview.change === 'add' && h('div', null,
                    risk('trustSummary', 'trustWarning'),
                    h('label', { className: 'mc-confirm' }, h('input', { type: 'checkbox', 'data-field': 'confirm-trust', checked: trustConfirmed, onChange: event => setTrustConfirmed(event.target.checked) }), h('span', null, t('trustConfirm'))),
                    h('div', { className: 'mc-actions' }, action('trustApply', 'trust-apply', applyTrust, !trustConfirmed, true))),
                  trustPreview.change === 'unchanged' && feedback('trustUnchanged'),
                  h('div', { className: 'mc-actions' }, action('trustCancel', 'trust-cancel', cancelTrust)),
                ),
              ),
            ),
            !isReady && enabled !== false && status !== 'needsTrustedHost' && h('section', { className: 'mc-card', 'data-testid': 'connection-next-step' },
              h('div', { className: 'mc-content mc-next' }, h('span', { className: 'mc-next-index', 'aria-hidden': true }, '→'),
                h('div', null, h('h3', null, t('nextStep')), h('p', { className: 'mc-help', role: 'status' }, t(status)),
                  h('p', { className: 'mc-help' }, t(status === 'checking' ? 'nextChecking' : status === 'starting' ? 'nextStarting' : status === 'notConfigured' ? 'nextMissing' : status === 'failed' || status === 'stopped' ? 'nextFailed' : 'nextUnavailable')))),
            ),
            isReady && h('section', { className: 'mc-card', 'data-testid': 'connection-ready', 'aria-busy': busy },
              h('div', { className: 'mc-card-head' }, h('h3', null, t('connectTitle')), h('p', { className: 'mc-help' }, t('connectHelp'))),
              h('div', { className: 'mc-content' },
                !secret && h('div', { className: 'mc-empty' }, phone,
                  h('div', null, h('p', { className: 'mc-empty-title' }, t('hiddenTitle')), h('p', { className: 'mc-help' }, t('hiddenHelp')),
                    h('div', { className: 'mc-actions' }, action('show', 'show', reveal, busy || desired !== null, true), busy && action('hide', 'hide', clearSecret)),
                    busy && feedback('loadingLink'))),
                secret && h('div', { className: 'mc-qr-layout', 'data-testid': 'connection-secret' },
                  h('img', { className: 'mc-qr', src: secret.qr, alt: t('qrAlt'), width: 240, height: 240 }),
                  h('div', { className: 'mc-qr-info' },
                    h('h3', null, t('scanTitle')), h('p', { className: 'mc-help' }, t('scanHelp')),
                    h('label', { className: 'mc-field', htmlFor: 'mobile-connection-owner-link' }, h('span', { className: 'mc-label' }, t('linkLabel')),
                      h('input', { className: 'mc-input mc-code', id: 'mobile-connection-owner-link', readOnly: true, autoComplete: 'off', spellCheck: false, value: secret.url })),
                    h('p', { className: 'mc-help' }, t('linkHelp')),
                    h('div', { className: 'mc-actions' }, action('copy', 'copy', copy, false, true), action('hide', 'hide', clearSecret)))),
                risk('linkSummary', 'warning'),
                feedback(message),
              ),
            ),
            configMessage && feedback(configMessage),
            desired !== null && h('div', { className: 'mc-actions' }, action('stopWaiting', 'stop-waiting', stopWaiting)),
            ['conflict', 'unavailable', 'pending', 'uncertain', 'effective'].includes(trustPhase) && feedback(`trust${trustPhase[0].toUpperCase()}${trustPhase.slice(1)}`),
            enabled === true && h('footer', { className: 'mc-footer' },
              h('div', { className: 'mc-footer-copy' }, h('p', { className: 'mc-footer-title' }, t('management')),
                observed.current?.authority && h('p', { className: 'mc-host mc-code' }, observed.current.authority),
                details('stopDetails', h('p', null, t('stopWarning')))),
              action('disable', 'disable', () => configure(false), desired !== null)),
          );
        }
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section', id: 'mobile-connection', order: 75, label: () => t('title'),
        }, Status));
      },
    };
  },
});

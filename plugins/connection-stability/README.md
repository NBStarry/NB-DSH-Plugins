# Connection stability / 连接稳定性

Configuration-only bundle for DSH **0.2.2-alpha.2**. No Host or Client plugin code, dependencies, scripts, listeners, authentication changes, or Tailscale operations.

## Change

Overrides the existing row `typert-gateway`, asserting its package name `@deepseek-ai/dsh-api-gateway`:

```yaml
config:
  websocketHeartbeatIntervalMs: 10000
```

The previously inspected Gateway schema default is **2000 ms**. The candidate is **10000 ms**. No values for `streamInboxBytes`, `websocketCompression`, or unknown fields are invented or pinned.

### Baseline evidence and limits

Loader replaces a row's whole `config`, rather than deep-merging it. Before installation, inspect the Gateway row and all applicable profile and command-line patches: replacing existing settings could change unrelated behavior, and a higher-priority override may still win. Review Plugin Manager's `application` and warnings, then verify the actual remote behavior; installation alone does not prove the effective interval.

## Expected impact

Applying or disabling this bundle may reload Gateway and briefly reconnect all open pages. It does not restart the Host. A longer heartbeat interval tolerates longer temporary network delays but also delays detection of a vanished peer. It is not a guaranteed fix for all reconnect causes.

Synthetic Gateway and proxy tests do not establish that a particular remote disconnect has the same cause; verify behavior in the target environment.

## Install and rollback

Only use the official Plugin Manager. Do not write installed package or profile files manually.

Rollback: disable the exact bundle `@local/dsh-connection-stability` in Plugin Manager. If the underlying configuration remains unchanged, the prior inherited configuration returns; independent higher-priority overrides remain authoritative. Rollback may briefly reconnect open pages too.

## 中文摘要

仅为现有 Gateway 设置 WebSocket 心跳间隔候选值 10 秒；不补写收件箱大小、压缩或未知字段。Loader 整体替换配置，安装前须检查底层配置及所有覆盖层，安装结果、警告和实际远程表现仍需核验。

应用或停用可能使所有页面短暂重连，不重启 Host。容忍窗口增大也会延迟失联检测，不能保证解决所有重连原因。回退时通过官方插件管理器停用此配置包；已知底层不变且无独立高层覆盖时恢复原继承值。

The bundled SVG is original artwork created for this bundle.

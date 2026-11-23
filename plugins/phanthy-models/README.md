# Phanthy models for DSH

An opt-in Host bundle that registers one `phanthy` model provider. Requests go to a local gateway process that you supply and run on your own machine. This package contains no gateway, no account access and no credentials.

## What it does

- Registers the `phanthy` provider with the models listed in this bundle's `config.models`. An empty list registers no provider.
- Each configured model appears as three options: the plain ID (`auto`), `<id>-cloud` and `<id>-non-cloud`. The suffixed IDs are local selection aliases; the gateway always receives the plain model ID.
- On the first request for an option, it starts the gateway with `python3 <gatewayPath>`, sends a fresh random 256-bit key on the gateway's stdin, and talks to it on loopback. The key never goes into argv, the environment, config or disk.
- Every request carries an `x-phanthy-session` header with the DSH session ID. A request without a valid session ID is refused before any gateway starts.
- No retries: a failed request is not retried by this plugin, pi-ai, or the DSH retry policy.

Activation, opening the model selector and listing models do not log in, read credentials, start the gateway or make network requests.

## Configuration

`gatewayPath` is machine-specific and must not be committed. Set it in your own profile patch, not in this package:

```yaml
- id: phanthy-models
  config:
    gatewayPath: /absolute/path/to/your/gateway.py
    models:
      - id: ACCOUNT_LISTED_MODEL_ID
        contextWindow: VERIFIED_CONTEXT_TOKENS
        maxTokens: 256          # request output budget, not a server limit
        input: [text]           # add image only with evidence
        # reasoning: adaptive   # only for models verified to support it
```

A row-level `config` replaces the bundle's `config` as a whole, so restate `models` alongside `gatewayPath`. If `gatewayPath` is omitted, it defaults to `../phanthy-dsh-gateway/gateway.py` relative to the installed package, which is rarely what you want. `python` selects the interpreter (default `python3`). Do not put secrets in this configuration.

`contextWindow` must be verified for the account and model; leave out models whose limits you cannot verify. `maxTokens` is the default request output budget and must not exceed `contextWindow`. The shipped config lists `claude-opus-5-5` with image input and adaptive reasoning as an example; check it against your account before use.

## Gateway contract

The gateway is started with its absolute path as the only argument. It reads one JSON line from stdin, `{"key":"<secret>","pool":"auto|cloud_desktop|non_cloud"}`, and writes one JSON line to stdout, `{"port":<n>}`. It must accept Anthropic Messages requests on `http://127.0.0.1:<port>`, authenticated with that key. Closing stdin asks it to shut down; the plugin falls back to SIGTERM after 3 s and SIGKILL after 2 s more.

## Compatibility

Built against DSH `0.2.2-alpha.2` with `@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-llm-pi-ai` and `@earendil-works/pi-ai` `1.3.0` as peer dependencies. It constructs PiAiAdapter's resolved profile the way that version does, which is not a stable public API; recheck after a DSH upgrade.

## Tests

From this directory: `npm test` (Node 22+). The tests use a fake Pi adapter, fake child processes and a loopback mock gateway. They do not contact any service or use credentials. Tests that load the shipped pi-ai run only when the macOS DeepSeek Harness app is installed, through its Electron binary in Node mode.

`node test/gateway-smoke.js` starts a real gateway and shuts it down without sending a request; set `GATEWAY_PATH` to an absolute path first.

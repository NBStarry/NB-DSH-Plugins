# Computer Use in all presets

A configuration-only bundle for macOS. It makes the existing Computer Use (`cua`) tool available to every Agent preset, including the standard and PTC presets, by setting `agentPreset: false` on the provider row.

It requires the Computer Use bundle (`@deepseek-ai/dsh-cua-bundle`) and its macOS provider to be installed separately; it installs neither, and it grants no application access or macOS permission. Application approval, Accessibility and Screen Recording permissions, cancellation and logging all work as before. Delegated Agents and other presets can now see the tool too, subject to their own tool restrictions.

## Configuration replaces the whole row

This patch replaces the provider row's `config` as a whole. The official bundle declares only `agentPreset: ptc`, so this patch restates nothing else.

If you also need a fixed helper location (`helperPath`, an absolute path that is specific to your machine), set it in your own profile patch together with `agentPreset: false`, not in this package:

```yaml
- id: cua
  config:
    agentPreset: false
    helperPath: /absolute/path/to/DSH Computer Use.app/Contents/MacOS/dsh-cua-native
```

Without `helperPath`, the provider builds or locates its own native helper.

## Notes

The Computer Use guidance includes PTC-specific instructions even when a standard Agent calls the raw `cua` tool. Screenshots need an image-capable model and attachment support. The provider stays disabled on non-macOS platforms.

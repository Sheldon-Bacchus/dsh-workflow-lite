---
title: Install
description: Install the plugin in the web or desktop version of DeepSeek Harness.
sidebar:
  order: 1
---

Supports DeepSeek Harness 0.2.x.

## Web version

Requires Node.js 22 or later.

```bash
dsh plugin --profile web add @xiaoso/dsh-workflow-lite
dsh web
```

## Desktop app

1. Open **Plugins** in the sidebar and choose the option to install a third-party plugin.
2. Enter `@xiaoso/dsh-workflow-lite` and click install.
3. Restart DeepSeek Harness.

After a successful install, a **Workflows** tab appears at the top of the session page. If it does not, see the [FAQ](/dsh-workflow-lite/en/faq/).

## Co-existence & Rollback (Fork Version)

This fork build uses an independent identifier (`workflow-lite-fork` / `@xiaoso/dsh-workflow-lite-fork`) and can be installed alongside the official plugin.

### Co-existence Installation
- **Web**: `dsh plugin --profile web add @xiaoso/dsh-workflow-lite-fork && dsh web`
- **Desktop**: Under **Plugins** → install third-party plugin, enter `@xiaoso/dsh-workflow-lite-fork`, install and restart.

### Rollback Steps
- **Web**: Run `dsh plugin --profile web remove workflow-lite-fork`.
- **Desktop**: Find `@xiaoso/dsh-workflow-lite-fork` under **Plugins**, click **Uninstall** and restart. Local workflow documents are preserved and will not be lost.

Next: [Create your first workflow](/dsh-workflow-lite/en/start/first-workflow/).

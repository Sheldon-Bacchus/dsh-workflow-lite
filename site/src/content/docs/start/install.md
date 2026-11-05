---
title: 安装
description: 在 DeepSeek Harness 的网页版或桌面端安装插件。
sidebar:
  order: 1
---

支持 DeepSeek Harness 0.2.x。

## 网页版

需要 Node.js 22 及以上。

```bash
dsh plugin --profile web add @xiaoso/dsh-workflow-lite
dsh web
```

## 桌面端

1. 打开侧边栏的「插件」，点击「添加插件」→「安装第三方插件」。
2. 填入 `@xiaoso/dsh-workflow-lite`，点击「安装」。
3. 重启 DeepSeek Harness。

安装成功后，会话页顶部出现「工作流」标签页。没有出现时见[常见问题](/dsh-workflow-lite/faq/)。

## 与原插件并存安装与回退（Fork 版本）

本 fork 产物使用独立标识（Plugin ID：`workflow-lite-fork` / 包名：`@xiaoso/dsh-workflow-lite-fork`），支持与官方原版插件并存安装。

### 并存安装
- **网页版**：`dsh plugin --profile web add @xiaoso/dsh-workflow-lite-fork && dsh web`
- **桌面端**：在「插件」→「安装第三方插件」中输入 `@xiaoso/dsh-workflow-lite-fork` 安装并重启。

### 回退步骤
- **网页版**：运行 `dsh plugin --profile web remove workflow-lite-fork` 卸载 fork 插件。
- **桌面端**：在「插件」列表中选择 `@xiaoso/dsh-workflow-lite-fork` 点击「卸载」并重启。工作流数据均保存在本地目录，卸载不会丢失工作流数据。

下一步：[创建第一个工作流](/dsh-workflow-lite/start/first-workflow/)。

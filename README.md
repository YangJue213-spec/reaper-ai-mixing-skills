# reaper-ai-mixing-skills

> MCP server for REAPER DAW - 通过 MCP（Model Context Protocol）协议让 AI 自动控制 REAPER 进行混音处理。

通过 MCP（Model Context Protocol）协议让 AI 自动控制 REAPER 进行混音处理。
支持效果器挂载、轨道管理、音频分析，混响和 Delay 自动路由到独立总线。

## 功能特性

- **AI 驱动的自动混音分析与执行** - 分析音频并自动挂载专业效果器链
- **效果器智能解析** - 从 REAPER 缓存文件动态匹配精确名称（支持 FabFilter、Waves 等）
- **混响 / Delay 独立总线路由** - 遵循专业混音规范，不直接挂在源轨道
- **完整的轨道和路由控制** - 创建、删除、重命名轨道，管理 Sends 和 Outputs
- **支持第三方 VST/VST3 插件** - FabFilter、Waves、Plugin Alliance 等

## 系统要求

- macOS（Apple Silicon 或 Intel）
- REAPER DAW（已安装并配置）
- Node.js 18+
- ffmpeg（用于音频转换）
- OpenAI API Key 或兼容的 API 服务

## 安装

### 1. 克隆项目

```bash
git clone https://github.com/yangjue213-spec/reaper-ai-mixing-skills.git
cd reaper-ai-mixing-skills
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 .env，填入你的 API Key：
- `OPENAI_API_KEY`：从 https://platform.openai.com/api-keys 获取（或使用 OpenRouter、lingkeapi 等代理服务）

### 4. 编译

```bash
npm run build
```

### 5. 在 REAPER 中加载桥接脚本

1. 打开 REAPER
2. Actions → Show Action List → Load ReaScript
3. 选择 `src/reaper/file-bridge.lua`
4. 运行该脚本（保持运行状态）

### 6. 配置 MCP 客户端

在 Cline 或其他 MCP 客户端的配置文件中添加：

```json
{
  "mcpServers": {
    "reaper": {
      "command": "node",
      "args": ["/path/to/reaper-mcp-server/build/index.js"]
    }
  }
}
```

## 使用方式

### 自动混音

在 Cline 中直接说：

```
帮我混音轨道 0 的人声
分析这条吉他轨道并处理
自动混音轨道 2
```

AI 会先展示诊断结果和计划操作，确认后再执行。

### 混音工作流程

```
音频分析（Gemini）
  ↓ 诊断 JSON（freq_problems + severity）
规则引擎
  ↓ 效果器链
1. Gate（如有底噪）
2. EQ 减法（先处理问题频段）
3. EQ 加法（补偿缺失频段）
4. 压缩
5. De-esser（仅人声）
6. Send → FX Reverb Bus
7. Send → FX Delay Bus
  ↓
REAPER 执行
```

## 可用 MCP 工具

### 项目与连接
| 工具名 | 描述 |
|--------|------|
| `check_reaper_connection` | 检查 REAPER file bridge 是否在线 |
| `get_project_info` | 获取项目信息（采样率、 tempo、轨道数等） |

### 轨道控制
| 工具名 | 描述 |
|--------|------|
| `create_track` | 创建新轨道（可选命名） |
| `delete_track` | 删除指定轨道 |
| `set_track_name` | 设置轨道名称 |
| `set_track_volume` | 设置轨道音量（dB） |
| `set_track_pan` | 设置轨道声相（-1 到 1） |
| `get_track_info` | 获取轨道详细信息 |

### 效果器管理
| 工具名 | 描述 |
|--------|------|
| `add_fx_to_track` | 挂载效果器（自动解析插件名称，支持 FabFilter/Waves） |
| `remove_fx_from_track` | 移除指定效果器 |
| `get_track_fx` | 获取轨道上所有效果器列表 |
| `get_fx_params` | 获取效果器所有参数 |
| `set_fx_param` | 设置效果器参数（绝对值） |
| `set_fx_param_normalized` | 设置效果器参数（归一化 0-1） |
| `set_fx_enabled` | 启用/禁用效果器 |
| `tweak_fx_parameter` | 按效果器名称调整参数 |
| `resolve_plugin_name` | 解析模糊插件名称为精确名称 |
| `get_available_plugins` | 获取可用插件列表（从缓存） |

### AI 分析
| 工具名 | 描述 |
|--------|------|
| `analyze_and_suggest_mix` | 分析音频并建议混音方案（可自动执行） |
| `start_audio_analysis` | 启动异步音频分析任务 |
| `get_analysis_status` | 获取分析任务状态 |

### 路由管理
| 工具名 | 描述 |
|--------|------|
| `set_track_send` | 创建 Send 到目标轨道（并行路由） |
| `set_track_output` | 设置轨道输出目的地 |
| `batch_set_track_send` | 批量创建 Sends |
| `batch_set_track_output` | 批量设置输出 |
| `manage_track_routing` | 精确控制路由（add_send/remove_send/set_master_send） |

### 媒体项
| 工具名 | 描述 |
|--------|------|
| `split_item` | 在指定位置分割媒体项 |
| `get_item_info` | 获取媒体项信息 |
| `analyze_media_item` | 分析媒体项音频属性 |

## 插件名称解析置信度

| confidence | 处理方式 |
|------------|----------|
| exact | 直接执行 |
| high | 直接执行 |
| medium | 告知用户匹配结果，确认后执行 |
| low (cache) | 警告用户，建议查找精确名称 |
| low (js_fallback) | 告知未找到插件，已回退到内置插件 |

## 参数安全范围

- EQ 单次增益：±6dB 以内
- 压缩 ratio：最大 8:1
- Send 电平：混响 0.25，Delay 0.20（归一化）

## 注意事项

- 目前仅支持 macOS（通信依赖 `/tmp/reaper-mcp/` 目录）
- 使用前请确保 file-bridge.lua 在 REAPER 内保持运行
- 建议在执行自动混音前先保存 REAPER 项目（Ctrl+S）
- `.env` 文件包含 API Key，已加入 .gitignore，请勿上传

## License

MIT © [yangjue213-spec]

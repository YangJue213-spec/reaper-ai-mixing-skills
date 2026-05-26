# Reaper 自动混音 Skill

## 概述
分析 Reaper 项目中指定轨道的音频，自动挂载效果器链完成混音处理。
混响和 Delay 统一路由到独立 Return 总线，不直接挂在源轨道上。

## 触发关键词
"帮我混音"、"分析这条轨道"、"自动处理音频"、"挂效果器"、
"混这个人声"、"处理一下鼓组"、"自动混音"

## 前置条件检查（每次使用前必须执行）
1. 调用 check_reaper_connection 确认 Reaper 在线
2. 调用 get_project_info 获取轨道列表
3. 确认目标轨道的 trackIndex

## 标准执行流程

### 第一步：分析（不执行）
调用 analyze_and_suggest_mix：
- trackIndex: <目标轨道编号>
- renderMode: "solo"
- trackType: <如用户提到了乐器/人声则填入，否则省略>
- autoApply: false

### 第二步：展示诊断结果给用户
呈现：
- 检测到的问题列表（diagnosis.problems）
- 计划挂载的效果器链（planned_operations）
- 如涉及混响/Delay，说明将创建独立总线

询问用户："是否执行以上操作？"

### 第三步：执行（用户确认后）
调用 analyze_and_suggest_mix：
- trackIndex: <同上>
- renderMode: "solo"
- trackType: <同上>
- autoApply: true

### 第四步：执行后确认
调用 get_track_fx 确认效果器已挂载
调用 get_project_info 确认总线轨道已创建（如有）
向用户报告完成情况

## 效果器挂载顺序（规则引擎保证）
1. Gate / 降噪（如有底噪）
2. EQ（先减后加）
3. 压缩
4. De-esser（仅人声且有齿音时）
5. Send → FX Reverb Bus（如需混响）
6. Send → FX Delay Bus（如需 Delay）

## 总线管理规则
- "FX Reverb Bus" 和 "FX Delay Bus" 全项目共用，不重复创建
- 总线轨道上的插件 wet 始终设为 1.0（干湿由 Send 电平控制）
- 总线轨道命名统一，便于后续手动调整

## 撤销方式
- 单个效果器：remove_fx_from_track
- 总线轨道：delete_track（注意记录 trackIndex）
- Reaper 内 Ctrl+Z 可撤销所有操作

## 参数安全范围
- EQ 单次增益：±6dB 以内
- 压缩 ratio：最大 8:1
- Send 电平：混响 0.25，Delay 0.20（归一化）
- 以上范围写死在规则引擎中，AI 无法突破

## 插件名称解析与置信度处理

调用 `resolve_plugin_name` 或 `add_fx_to_track` 时，返回字段 `confidence` 的含义：

| confidence | source       | 处理方式                                                                 |
|------------|--------------|--------------------------------------------------------------------------|
| exact       | cache        | 直接执行，无需提示                                                       |
| high        | cache        | 直接执行，无需提示                                                       |
| medium      | cache        | 告知用户匹配结果（例如 "已匹配到 VST3: Pro-C 2 (FabFilter)"），确认后执行 |
| low         | cache        | 警告用户，建议先用 `get_available_plugins` 查找精确名称再操作           |
| low         | js_fallback  | 明确告知未在插件库中找到该插件，已回退到 Cockos 内置插件，建议检查插件安装情况 |

示例：用户输入 "fabfilter compressor"，confidence=medium → 告知将挂载 "VST3: Pro-C 2 (FabFilter)"，确认后再 `add_fx_to_track`。

## 已知限制
- 仅支持 macOS（路径依赖 /tmp/reaper-mcp/）
- 单次分析最长等待 90 秒
- 需要 file-bridge.lua 已在 Reaper 内运行
- peak_level 数据当前始终为 0（待修复），分析依赖响度数据

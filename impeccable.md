# Impeccable Context

## Product
- 项目名：Map Picture（微信地图相册）
- 形态：微信小程序前端 + Spring Boot 后端 + MySQL
- 核心能力：按省份相册、文件夹管理、双人配对共享、鉴权图片访问

## Target Users
- 个人用户与双人协作用户（情侣/搭子/巡检同伴）
- 高频在移动端使用，偏好低学习成本和快速操作
- 典型诉求：上传快、找图快、整理快、共享关系清晰

## Experience Goals
- 交互路径短：重要动作在 1-2 步内完成
- 信息结构清晰：省份、文件夹、照片三级关系稳定
- 操作反馈明确：上传、删除、移动、配对状态都要即时可见
- 安全默认：所有照片访问必须经过鉴权接口

## UI / Tone
- 整体气质：沉稳、克制、专业
- 视觉关键词：Natural Archive（自然档案馆）
- 色彩建议：低饱和青绿 + 中性色，不做高对比炫彩风格
- 文案风格：简短、直接、无营销语气

## Engineering Constraints
- 后端：Java 21 + Spring Boot 3.3 + JDBC + MySQL
- 小程序接口以 `Authorization: Bearer <token>` 进行鉴权
- 上传目录与日志目录由配置决定：`app.upload.dir`、`app.log.dir`
- 禁止把运行产物提交到仓库（如 `logs/`、`backend/target/`、`.idea/`）

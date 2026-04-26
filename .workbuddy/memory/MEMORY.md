# LoveLin 地理相册 - 长期记忆

## 项目概况
- **项目名**：LoveLin 地理相册（Map_Picture）
- **定位**：双人地理相册微信小程序，基于省份地图展示照片
- **后端**：Java 21 + Spring Boot 3.3.4 + JdbcTemplate + MySQL，端口 3000
- **前端**：微信小程序
- **认证**：Bearer token，登录流程 wx.login → code → 后端 jscode2session → token

## 技术约定
- 照片访问需鉴权：`/api/photos/file/{id}` + Bearer token
- 前端用 `wx.downloadFile` 下载到 tempFilePath 后显示（不能直接 src= URL）
- 配置环境：`config.js` 有 dev/device/prod 三档，本地开发用 device（局域网 IP）
- 上传支持 multipart 和 base64 两种模式

## 已知问题（待修复）
1. `deleteFolder()` - 事务内删磁盘文件，原子性风险（高优先级）
2. `restoreSession()` - 不检查 token `expiresAt`，冷启动首请求可能 401（高优先级）
3. 缩略图下载失败时 `displayPath=''`，图片空白且点击无效（中优先级）
4. CORS 配置：`corsOrigin` 为空时允许所有来源（中优先级）
5. `config.js` prod URL 仍为占位符 `https://example.com`（部署前必改）
6. `savePhoto()` - INSERT 空 `file_url` 再 UPDATE，可简化或删掉该字段

## 历史问题
- ClashX 代理可能阻断后端调用 `api.weixin.qq.com`（Java HttpClient 默认不走系统代理）
- 曾使用 Node.js 后端（Express+SQLite+JWT），现已完全迁移至 Java Spring Boot

## 用户偏好
- 中文口语化简洁风格
- 少问多做，直接执行
- 输出用纯文字表格 + emoji

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
1. ~~`deleteFolder()` - 事务内删磁盘文件，原子性风险~~ ✅ 已修复（拆分事务与文件删除）
2. ~~`restoreSession()` - 不检查 token `expiresAt`，冷启动首请求可能 401~~ ✅ 已修复
3. ~~缩略图下载失败时 `displayPath=''`，图片空白且点击无效~~ ✅ 已修复（占位UI+点击重试）
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
- 不要擅自改核心交互逻辑（如昵称必须用微信选择，不能改成手动输入）
- 改完代码 commit，要 push 时再 push

## 部署状态
- **域名**：lovelin.com.cn（已购，实名已过）
- **服务器**：阿里云 ECS 47.116.214.42
- **DNS**：A 记录 @ 和 www → 47.116.214.42 ✅
- **Nginx**：80 端口反代 → 3000 ✅，安全组 80/443 已开 ✅
- **ICP 备案**：待提交（用户去操作）
- **HTTPS**：等备案通过后申请免费 SSL + 配 Nginx 443
- **prod URL**：`http://lovelin.com.cn`（备案后改 https）

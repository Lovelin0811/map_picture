# 地理相册小程序（含后端）

一个支持微信登录、按用户隔离相册、按省份管理照片的微信小程序示例。

## 功能

- 登录弹窗：选择头像 + 填写昵称
- 按登录用户隔离相册数据（不同用户看自己的照片）
- 省份地图入口 + 省份图库
- 图片上传到后端（不再使用本地存储）
- 照片预览和删除

## 目录结构

- `miniprogram/` 小程序前端
- `backend/` Node.js 后端（Express + SQLite）

## 启动后端

1. 进入 `backend` 目录
2. 确保 Node.js 版本 `>=18`
3. 安装依赖：`npm install`
4. 启动服务：`npm run dev`
5. 默认地址：`http://127.0.0.1:3000`

## 启动小程序

1. 打开微信开发者工具，导入 `miniprogram`
2. 若是真机调试，请修改 `miniprogram/config.js` 的 `API_BASE` 为你电脑局域网 IP
3. 勾选开发者工具中“**不校验合法域名**”用于本地调试
4. 登录后再点击地图进入省份图库并上传照片

## 说明

- 后端 `wechat-login` 当前已使用微信 `jscode2session` 正式逻辑。
- 运行前需要在后端环境变量中配置 `WECHAT_APPID` 与 `WECHAT_SECRET`。
- 图片访问已改为鉴权接口 `/api/photos/file/:id`，不再公开静态目录。

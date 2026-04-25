# Map Picture（微信地图相册）

一个微信小程序 + Java 后端项目，支持按省份管理照片、文件夹管理、双人共享相册配对，以及鉴权访问图片。

## 当前技术栈

- 小程序前端：`miniprogram/`
- 后端：Spring Boot 3.3 + JDBC + MySQL（`backend/`）
- Java 版本：21

## 核心功能

- 微信登录：`/api/auth/wechat-login`
- 会话鉴权：基于 `Bearer token`
- 相册配对：邀请、接受邀请、解绑
- 按省份查看照片列表与统计
- 文件夹管理：创建、删除、照片移动文件夹
- 图片上传：支持 `multipart/form-data` 与 `base64`
- 图片访问：通过鉴权接口 `/api/photos/file/{id}`

## 目录结构

- `miniprogram/`：微信小程序代码
- `backend/src/main/java`：后端业务代码
- `backend/src/main/resources`：后端配置（`application.properties`、`logback-spring.xml`）
- `uploads/`：上传文件目录（运行时创建）
- `logs/`：日志目录（运行时创建）

## 后端启动

1. 准备 MySQL 并创建数据库（默认库名：`lovelin`）。
2. 按需修改 `backend/src/main/resources/application.properties` 中数据库连接。
3. 进入后端目录并启动：

```bash
cd backend
./mvnw spring-boot:run
```

如果本机没有 `mvnw`，可用系统 Maven：

```bash
cd backend
mvn spring-boot:run
```

默认服务地址：`http://127.0.0.1:3000`。  
健康检查：`/health` 或 `/api/health`。

## 小程序启动

1. 微信开发者工具导入 `miniprogram` 目录。
2. 根据运行环境修改 `miniprogram/config.js`：
- `dev`：开发者工具本机调试
- `device`：真机调试（改成电脑局域网 IP）
- `prod`：线上域名
3. 本地联调时，开发者工具可勾选“不校验合法域名”。

## 关键配置

- 数据库：`spring.datasource.*`
- 上传目录：`app.upload.dir`（默认 `uploads`）
- 日志目录：`app.log.dir`（默认 `logs`）
- 微信配置：`app.wechat.appid`、`app.wechat.secret`

## 备注

- 代码仓库忽略了 IDE 与运行产物目录：`.idea/`、`backend/.idea/`、`backend/target/`、`logs/`。

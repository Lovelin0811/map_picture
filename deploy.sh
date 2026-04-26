#!/bin/bash
# LoveLin 一键部署脚本
# 用法：在服务器上用 root 执行 bash deploy.sh
# 前提：lovelin 用户已创建，密码已设置

set -e

echo "========================================="
echo "  LoveLin 一键部署脚本"
echo "========================================="

# ---------- 配置区 ----------
DB_NAME="lovelin"
DB_USER="lovelin"
DB_PASS="Lov3lin@2026"
APP_DIR="/opt/lovelin"
UPLOAD_DIR="/data/lovelin/uploads"
LOG_DIR="/data/lovelin/logs"
JAR_NAME="lovelin-0.0.1-SNAPSHOT.jar"
# ----------------------------

# 1. 安装 Java 21
echo ""
echo ">>> [1/7] 安装 Java 21 ..."
if java -version 2>&1 | grep -q "21"; then
    echo "    Java 21 已安装，跳过"
else
    yum install -y java-21-openjdk java-21-openjdk-devel
    java -version
fi

# 2. 安装 MySQL 8
echo ""
echo ">>> [2/7] 安装 MySQL 8 ..."
if command -v mysql &> /dev/null; then
    echo "    MySQL 已安装，跳过"
else
    yum install -y mysql-server
    systemctl enable mysqld
    systemctl start mysqld
    echo "    MySQL 已启动"
fi

# 3. 创建数据库和用户
echo ""
echo ">>> [3/7] 配置数据库 ..."
mysql -u root <<EOF
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
EOF
echo "    数据库 ${DB_NAME} 和用户 ${DB_USER} 已创建"

# 4. 创建目录
echo ""
echo ">>> [4/7] 创建应用目录 ..."
mkdir -p ${APP_DIR}
mkdir -p ${UPLOAD_DIR}
mkdir -p ${LOG_DIR}
chown -R lovelin:lovelin ${APP_DIR}
chown -R lovelin:lovelin ${UPLOAD_DIR}
chown -R lovelin:lovelin ${LOG_DIR}
echo "    目录已创建"

# 5. 生成配置文件
echo ""
echo ">>> [5/7] 生成配置文件 ..."
cat > ${APP_DIR}/local.properties <<EOF
# 数据库（生产环境请改强密码）
spring.datasource.url=jdbc:mysql://localhost:3306/${DB_NAME}?useSSL=true&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=utf8
spring.datasource.username=${DB_USER}
spring.datasource.password=${DB_PASS}

# 微信小程序配置（⚠️ 必填！替换成你自己的）
app.wechat.appid=wxa471e1b37045d49b
app.wechat.secret=你的微信小程序secret

# 上传和日志目录
app.upload.dir=${UPLOAD_DIR}
app.log.dir=${LOG_DIR}

# CORS（微信小程序域名）
app.cors-origin=https://servicewechat.com
EOF
chown lovelin:lovelin ${APP_DIR}/local.properties
echo "    配置文件已生成: ${APP_DIR}/local.properties"
echo ""
echo "    ⚠️  注意：请编辑 ${APP_DIR}/local.properties 填入微信小程序 secret！"
echo "    命令：vi ${APP_DIR}/local.properties"

# 6. 创建 systemd 服务
echo ""
echo ">>> [6/7] 创建 systemd 服务 ..."
cat > /etc/systemd/system/lovelin.service <<EOF
[Unit]
Description=LoveLin Map Photo Album
After=network.target mysqld.service

[Service]
Type=simple
User=lovelin
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/java -jar ${APP_DIR}/${JAR_NAME} --spring.config.import=optional:file:${APP_DIR}/local.properties
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
echo "    服务已创建"

# 7. 安装 Nginx
echo ""
echo ">>> [7/7] 安装 Nginx ..."
if command -v nginx &> /dev/null; then
    echo "    Nginx 已安装，跳过"
else
    yum install -y nginx
    systemctl enable nginx
    systemctl start nginx
    echo "    Nginx 已启动"
fi

echo ""
echo "========================================="
echo "  ✅ 基础环境部署完成！"
echo "========================================="
echo ""
echo "接下来需要："
echo ""
echo "1️⃣  在本地打包 jar："
echo "    cd backend && mvn clean package -DskipTests"
echo ""
echo "2️⃣  上传 jar 到服务器："
echo "    scp backend/target/${JAR_NAME} lovelin@<YOUR_SERVER_IP>:${APP_DIR}/"
echo ""
echo "3️⃣  填写微信 secret："
echo "    vi ${APP_DIR}/local.properties"
echo "    # 把 app.wechat.secret=你的微信小程序secret 改成真实值"
echo ""
echo "4️⃣  启动应用："
echo "    systemctl start lovelin"
echo "    systemctl status lovelin"
echo ""
echo "5️⃣  配置 Nginx + HTTPS（需要域名）："
echo "    暂时测试可用 http://<YOUR_SERVER_IP>:3000/api/health"
echo ""

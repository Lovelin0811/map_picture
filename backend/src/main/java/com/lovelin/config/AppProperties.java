package com.lovelin.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private String corsOrigin = "";
    private final Wechat wechat = new Wechat();
    private final Photo photo = new Photo();
    private final Upload upload = new Upload();
    private final Log log = new Log();

    public String getCorsOrigin() {
        return corsOrigin;
    }

    public void setCorsOrigin(String corsOrigin) {
        this.corsOrigin = corsOrigin;
    }

    public Wechat getWechat() {
        return wechat;
    }

    public Photo getPhoto() {
        return photo;
    }

    public Upload getUpload() {
        return upload;
    }

    public Log getLog() {
        return log;
    }

    public static class Wechat {
        private String appid = "";
        private String secret = "";

        public String getAppid() {
            return appid;
        }

        public void setAppid(String appid) {
            this.appid = appid;
        }

        public String getSecret() {
            return secret;
        }

        public void setSecret(String secret) {
            this.secret = secret;
        }
    }

    public static class Photo {
        private int pageSize = 30;
        private int maxPageSize = 80;

        public int getPageSize() {
            return pageSize;
        }

        public void setPageSize(int pageSize) {
            this.pageSize = pageSize;
        }

        public int getMaxPageSize() {
            return maxPageSize;
        }

        public void setMaxPageSize(int maxPageSize) {
            this.maxPageSize = maxPageSize;
        }
    }

    public static class Upload {
        private int maxUploadMb = 10;
        private String dir = "uploads";

        public int getMaxUploadMb() {
            return maxUploadMb;
        }

        public void setMaxUploadMb(int maxUploadMb) {
            this.maxUploadMb = maxUploadMb;
        }

        public String getDir() {
            return dir;
        }

        public void setDir(String dir) {
            this.dir = dir;
        }
    }

    public static class Log {
        private String dir = "logs";
        private int retentionDays = 14;

        public String getDir() {
            return dir;
        }

        public void setDir(String dir) {
            this.dir = dir;
        }

        public int getRetentionDays() {
            return retentionDays;
        }

        public void setRetentionDays(int retentionDays) {
            this.retentionDays = retentionDays;
        }
    }
}

package com.lovelin;

import com.lovelin.config.AppProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
public class LoveLinApplication {

    public static void main(String[] args) {
        SpringApplication.run(LoveLinApplication.class, args);
    }
}

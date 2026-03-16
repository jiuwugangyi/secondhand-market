package com.market.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.File;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Value("${app.upload-dir:public/uploads}")
    private String uploadDir;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // 静态文件
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/", "file:public/");
        // 上传文件
        File uploadPath = new File(uploadDir);
        if (!uploadPath.exists()) uploadPath.mkdirs();
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations("file:" + uploadPath.getAbsolutePath() + "/");
    }
}

package com.market.controller;

import com.market.service.DbService;
import com.market.service.FileService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class UserController {

    @Autowired private DbService db;
    @Autowired private FileService fileService;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    // 注册
    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> body, HttpSession session) {
        String username = body.get("username");
        String password = body.get("password");
        String phone = body.get("phone");
        if (username == null || username.isBlank() || password == null || password.isBlank())
            return err(400, "用户名和密码不能为空");
        if (username.length() < 2 || username.length() > 20) return err(400, "用户名长度2-20位");
        if (password.length() < 6) return err(400, "密码至少6位");
        try {
            String hash = encoder.encode(password);
            long id = db.insert("INSERT INTO users (username, password, phone) VALUES (?, ?, ?)",
                    username, hash, phone);
            session.setAttribute("userId", (int) id);
            session.setAttribute("username", username);
            return ok(Map.of("success", true, "userId", id, "username", username));
        } catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().contains("UNIQUE"))
                return err(400, "用户名已存在");
            return err(500, "注册失败");
        }
    }

    // 登录
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body, HttpSession session) {
        String username = body.get("username");
        String password = body.get("password");
        try {
            Map<String, Object> user = db.queryOne("SELECT * FROM users WHERE username = ?", username);
            if (user == null) return err(400, "用户名或密码错误");
            if (!encoder.matches(password, (String) user.get("password")))
                return err(400, "用户名或密码错误");
            session.setAttribute("userId", ((Number) user.get("id")).intValue());
            session.setAttribute("username", user.get("username"));
            return ok(Map.of("success", true, "userId", user.get("id"),
                    "username", user.get("username"), "avatar", user.getOrDefault("avatar", "")));
        } catch (Exception e) {
            return err(500, "登录失败");
        }
    }

    // 登出
    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpSession session) {
        session.invalidate();
        return ok(Map.of("success", true));
    }

    // 获取当前用户
    @GetMapping("/me")
    public ResponseEntity<?> me(HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid == null) return err(401, "请先登录");
        try {
            Map<String, Object> user = db.queryOne(
                    "SELECT id, username, avatar, phone, bio, created_at FROM users WHERE id = ?", uid);
            if (user == null) return err(404, "用户不存在");
            return ok(user);
        } catch (Exception e) { return err(500, "查询失败"); }
    }

    // 获取用户公开信息
    @GetMapping("/users/{id}")
    public ResponseEntity<?> getUser(@PathVariable int id) {
        try {
            Map<String, Object> user = db.queryOne(
                    "SELECT id, username, avatar, bio, created_at FROM users WHERE id = ?", id);
            if (user == null) return err(404, "用户不存在");
            return ok(user);
        } catch (Exception e) { return err(500, "查询失败"); }
    }

    // 更新个人信息
    @PutMapping("/me")
    public ResponseEntity<?> updateMe(@RequestBody Map<String, String> body, HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid == null) return err(401, "请先登录");
        try {
            db.update("UPDATE users SET phone = ?, bio = ? WHERE id = ?",
                    body.get("phone"), body.get("bio"), uid);
            return ok(Map.of("success", true));
        } catch (Exception e) { return err(500, "更新失败"); }
    }

    // 头像上传
    @PostMapping("/me/avatar")
    public ResponseEntity<?> uploadAvatar(@RequestParam("avatar") MultipartFile file, HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid == null) return err(401, "请先登录");
        try {
            String url = fileService.save(file);
            db.update("UPDATE users SET avatar = ? WHERE id = ?", url, uid);
            return ok(Map.of("success", true, "avatar", url));
        } catch (Exception e) { return err(500, "上传失败: " + e.getMessage()); }
    }

    // 会话检查
    @GetMapping("/session")
    public ResponseEntity<?> sessionCheck(HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid != null) {
            return ok(Map.of("loggedIn", true, "userId", uid,
                    "username", session.getAttribute("username")));
        }
        return ok(Map.of("loggedIn", false));
    }

    // ===== 工具方法 =====
    static ResponseEntity<Map<String, Object>> ok(Map<String, Object> body) {
        return ResponseEntity.ok(body);
    }
    static ResponseEntity<Map<String, Object>> ok(Object body) {
        if (body instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) body;
            return ResponseEntity.ok(m);
        }
        Map<String, Object> m = new HashMap<>();
        m.put("data", body);
        return ResponseEntity.ok(m);
    }
    static ResponseEntity<Map<String, Object>> err(int status, String msg) {
        return ResponseEntity.status(status).body(Map.of("error", msg));
    }
}

package com.market.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.sql.*;
import java.util.*;

@Service
public class DbService {

    @Autowired
    private Connection conn;

    private final ObjectMapper mapper = new ObjectMapper();

    // ===== 通用查询 =====
    public List<Map<String, Object>> query(String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            setParams(ps, params);
            ResultSet rs = ps.executeQuery();
            return toList(rs);
        }
    }

    public Map<String, Object> queryOne(String sql, Object... params) throws SQLException {
        List<Map<String, Object>> list = query(sql, params);
        return list.isEmpty() ? null : list.get(0);
    }

    public int update(String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            setParams(ps, params);
            return ps.executeUpdate();
        }
    }

    public long insert(String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            setParams(ps, params);
            ps.executeUpdate();
            ResultSet keys = ps.getGeneratedKeys();
            return keys.next() ? keys.getLong(1) : -1;
        }
    }

    private void setParams(PreparedStatement ps, Object[] params) throws SQLException {
        for (int i = 0; i < params.length; i++) {
            ps.setObject(i + 1, params[i]);
        }
    }

    private List<Map<String, Object>> toList(ResultSet rs) throws SQLException {
        List<Map<String, Object>> list = new ArrayList<>();
        ResultSetMetaData meta = rs.getMetaData();
        int cols = meta.getColumnCount();
        while (rs.next()) {
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 1; i <= cols; i++) {
                row.put(meta.getColumnLabel(i), rs.getObject(i));
            }
            list.add(row);
        }
        return list;
    }

    // ===== 图片 JSON 解析 =====
    @SuppressWarnings("unchecked")
    public List<String> parseImages(Object raw) {
        if (raw == null) return new ArrayList<>();
        try { return mapper.readValue(raw.toString(), List.class); } catch (Exception e) { return new ArrayList<>(); }
    }

    public String toJson(Object obj) {
        try { return mapper.writeValueAsString(obj); } catch (Exception e) { return "[]"; }
    }
}

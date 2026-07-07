// 사용자 인증 정보와 권한 맵을 PostgreSQL에서 조회하는 서비스
package kr.co.azsoft.azbrain.service;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import kr.co.azsoft.azbrain.security.AzbrainPrincipal;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class UserService {
  private final JdbcTemplate jdbcTemplate;

  public UserService(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public Optional<UserRecord> findUser(String id) {
    return jdbcTemplate.query(
        """
        select id, password_hash, user_type, role
        from users
        where id = ?
        """,
        (rs, rowNum) -> new UserRecord(
            rs.getString("id"),
            rs.getString("password_hash"),
            rs.getString("user_type"),
            rs.getString("role")
        ),
        id
    ).stream().findFirst();
  }

  public Optional<AzbrainPrincipal> loadPrincipal(String id) {
    return findUser(id).map(user -> new AzbrainPrincipal(
        user.id(),
        "admin".equals(user.role()),
        user.userType(),
        loadRepoPermissions(id),
        loadCompanyPermissions(id)
    ));
  }

  public Map<String, String> loadRepoPermissions(String userId) {
    return jdbcTemplate.query(
        """
        select repo_id, level
        from user_repo_permissions
        where user_id = ?
        """,
        rs -> {
          Map<String, String> result = new HashMap<>();
          while (rs.next()) result.put(rs.getString("repo_id"), rs.getString("level"));
          return result;
        },
        userId
    );
  }

  public Map<String, String> loadCompanyPermissions(String userId) {
    return jdbcTemplate.query(
        """
        select company_id, level
        from user_company_permissions
        where user_id = ?
        """,
        rs -> {
          Map<String, String> result = new HashMap<>();
          while (rs.next()) result.put(rs.getString("company_id"), rs.getString("level"));
          return result;
        },
        userId
    );
  }

  public record UserRecord(String id, String passwordHash, String userType, String role) {
  }
}

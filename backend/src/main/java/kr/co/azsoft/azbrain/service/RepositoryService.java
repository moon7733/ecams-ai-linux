// 저장소 목록과 사용자별 접근 권한을 계산하는 서비스
package kr.co.azsoft.azbrain.service;

import java.util.LinkedHashMap;
import java.util.Map;
import kr.co.azsoft.azbrain.model.RepositoryDto;
import kr.co.azsoft.azbrain.security.AzbrainPrincipal;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class RepositoryService {
  private final JdbcTemplate jdbcTemplate;

  public RepositoryService(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public Map<String, RepositoryDto> findAllRepositoryMeta() {
    return jdbcTemplate.query(
        """
        select id, path, company_id, type
        from repositories
        order by id asc
        """,
        rs -> {
          Map<String, RepositoryDto> result = new LinkedHashMap<>();
          while (rs.next()) {
            result.put(rs.getString("id"), new RepositoryDto(
                rs.getString("path"),
                rs.getString("company_id"),
                rs.getString("type")
            ));
          }
          return result;
        }
    );
  }

  public Map<String, String> resolveUserRepos(AzbrainPrincipal principal) {
    Map<String, RepositoryDto> allRepos = findAllRepositoryMeta();
    if (principal.admin()) {
      Map<String, String> result = new LinkedHashMap<>();
      allRepos.keySet().forEach(id -> result.put(id, "edit"));
      return result;
    }

    Map<String, String> result = new LinkedHashMap<>(principal.repos());
    for (Map.Entry<String, RepositoryDto> entry : allRepos.entrySet()) {
      String companyId = entry.getValue().companyId();
      String companyLevel = companyId == null ? null : principal.companies().get(companyId);
      if (companyLevel != null) {
        result.merge(entry.getKey(), companyLevel, RepositoryService::maxLevel);
      }
    }
    return result;
  }

  private static String maxLevel(String left, String right) {
    return "edit".equals(left) || "edit".equals(right) ? "edit" : "read";
  }
}

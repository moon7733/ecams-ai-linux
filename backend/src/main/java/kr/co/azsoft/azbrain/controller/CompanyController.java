// 기존 고객사 목록 API 계약을 PostgreSQL 기반으로 제공하는 컨트롤러
package kr.co.azsoft.azbrain.controller;

import java.util.Map;
import kr.co.azsoft.azbrain.model.CompanyDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class CompanyController {
  private final JdbcTemplate jdbcTemplate;

  public CompanyController(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @GetMapping("/companies")
  public Map<String, Object> companies() {
    var companies = jdbcTemplate.query(
        """
        select id, name, address, manager
        from companies
        order by name collate "C" asc
        """,
        (rs, rowNum) -> new CompanyDto(
            rs.getString("id"),
            rs.getString("name"),
            rs.getString("address"),
            rs.getString("manager")
        )
    );
    return Map.of("companies", companies);
  }
}

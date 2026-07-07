// 기존 저장소 목록 API 계약을 PostgreSQL 기반으로 제공하는 컨트롤러
package kr.co.azsoft.azbrain.controller;

import java.util.Map;
import kr.co.azsoft.azbrain.model.RepositoryDto;
import kr.co.azsoft.azbrain.security.AzbrainPrincipal;
import kr.co.azsoft.azbrain.service.RepositoryService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class RepositoryController {
  private final RepositoryService repositoryService;

  public RepositoryController(RepositoryService repositoryService) {
    this.repositoryService = repositoryService;
  }

  @GetMapping("/repos/all")
  public Map<String, Object> allRepos() {
    return Map.of("allRepos", repositoryService.findAllRepositoryMeta().keySet());
  }

  @GetMapping("/repos")
  public Map<String, Object> repos(@AuthenticationPrincipal AzbrainPrincipal principal) {
    Map<String, String> repos = repositoryService.resolveUserRepos(principal);
    Map<String, RepositoryDto> allMeta = repositoryService.findAllRepositoryMeta();
    Map<String, RepositoryDto> repoMeta = repos.keySet().stream()
        .filter(allMeta::containsKey)
        .collect(java.util.stream.Collectors.toMap(
            id -> id,
            allMeta::get,
            (left, right) -> left,
            java.util.LinkedHashMap::new
        ));

    return Map.of(
        "repos", repos,
        "repoMeta", repoMeta,
        "isAdmin", principal.admin()
    );
  }
}

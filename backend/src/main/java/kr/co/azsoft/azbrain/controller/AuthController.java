// 기존 로그인 API 계약을 JWT 기반으로 제공하는 컨트롤러
package kr.co.azsoft.azbrain.controller;

import java.util.Map;
import kr.co.azsoft.azbrain.security.JwtService;
import kr.co.azsoft.azbrain.service.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {
  private final UserService userService;
  private final PasswordEncoder passwordEncoder;
  private final JwtService jwtService;

  public AuthController(UserService userService, PasswordEncoder passwordEncoder, JwtService jwtService) {
    this.userService = userService;
    this.passwordEncoder = passwordEncoder;
    this.jwtService = jwtService;
  }

  @PostMapping("/login")
  public ResponseEntity<?> login(@RequestBody LoginRequest request) {
    return userService.findUser(request.id()).map(user -> {
      if (!passwordEncoder.matches(request.password(), user.passwordHash())) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(Map.of("error", "아이디 또는 비밀번호가 올바르지 않습니다."));
      }

      String token = jwtService.issue(user.id());
      Map<String, String> repos = userService.loadRepoPermissions(user.id());
      return ResponseEntity.ok(Map.of(
          "token", token,
          "id", user.id(),
          "isAdmin", "admin".equals(user.role()),
          "repos", repos
      ));
    }).orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED)
        .body(Map.of("error", "아이디 또는 비밀번호가 올바르지 않습니다.")));
  }

  public record LoginRequest(String id, String password) {
  }
}

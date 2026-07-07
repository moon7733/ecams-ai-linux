// Bearer 토큰을 읽어 Spring Security 인증으로 변환하는 필터
package kr.co.azsoft.azbrain.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import kr.co.azsoft.azbrain.service.UserService;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
  private final JwtService jwtService;
  private final UserService userService;

  public JwtAuthenticationFilter(JwtService jwtService, UserService userService) {
    this.jwtService = jwtService;
    this.userService = userService;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request,
      HttpServletResponse response,
      FilterChain filterChain
  ) throws ServletException, IOException {
    String token = resolveToken(request.getHeader("Authorization"));
    if (token != null && SecurityContextHolder.getContext().getAuthentication() == null) {
      String userId = jwtService.verifyAndGetSubject(token);
      if (userId != null) {
        userService.loadPrincipal(userId).ifPresent(principal -> {
          UsernamePasswordAuthenticationToken auth =
              new UsernamePasswordAuthenticationToken(principal, null, List.of());
          SecurityContextHolder.getContext().setAuthentication(auth);
        });
      }
    }
    filterChain.doFilter(request, response);
  }

  private static String resolveToken(String authorization) {
    if (authorization == null || authorization.isBlank()) return null;
    if (authorization.startsWith("Bearer ")) return authorization.substring(7);
    return authorization;
  }
}

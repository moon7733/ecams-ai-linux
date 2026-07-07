// JWT 인증 후 요청 컨텍스트에 보관할 사용자 주체
package kr.co.azsoft.azbrain.security;

import java.util.Map;

public record AzbrainPrincipal(
    String id,
    boolean admin,
    String userType,
    Map<String, String> repos,
    Map<String, String> companies
) {
}

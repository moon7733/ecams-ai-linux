// 외부 라이브러리 없이 HMAC-SHA256 JWT를 발급하고 검증하는 서비스
package kr.co.azsoft.azbrain.security;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class JwtService {
  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final Base64.Encoder URL_ENCODER = Base64.getUrlEncoder().withoutPadding();
  private static final Base64.Decoder URL_DECODER = Base64.getUrlDecoder();

  private final byte[] secret;
  private final long ttlSeconds;

  public JwtService(
      @Value("${azbrain.jwt.secret}") String secret,
      @Value("${azbrain.jwt.ttl-seconds}") long ttlSeconds
  ) {
    this.secret = secret.getBytes(StandardCharsets.UTF_8);
    this.ttlSeconds = ttlSeconds;
  }

  public String issue(String userId) {
    long now = Instant.now().getEpochSecond();
    Map<String, Object> header = Map.of("alg", "HS256", "typ", "JWT");
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("sub", userId);
    payload.put("iat", now);
    payload.put("exp", now + ttlSeconds);

    String headerPart = encodeJson(header);
    String payloadPart = encodeJson(payload);
    String signedPart = headerPart + "." + payloadPart;
    return signedPart + "." + sign(signedPart);
  }

  public String verifyAndGetSubject(String token) {
    String[] parts = token.split("\\.");
    if (parts.length != 3) return null;

    String signedPart = parts[0] + "." + parts[1];
    if (!constantTimeEquals(sign(signedPart), parts[2])) return null;

    try {
      Map<String, Object> payload = MAPPER.readValue(URL_DECODER.decode(parts[1]), new TypeReference<>() {});
      Object exp = payload.get("exp");
      if (!(exp instanceof Number) || ((Number) exp).longValue() < Instant.now().getEpochSecond()) return null;
      Object sub = payload.get("sub");
      return sub == null ? null : String.valueOf(sub);
    } catch (Exception e) {
      return null;
    }
  }

  private static String encodeJson(Map<String, Object> value) {
    try {
      return URL_ENCODER.encodeToString(MAPPER.writeValueAsBytes(value));
    } catch (Exception e) {
      throw new IllegalStateException("JWT JSON 인코딩 실패", e);
    }
  }

  private String sign(String value) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret, "HmacSHA256"));
      return URL_ENCODER.encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException("JWT 서명 실패", e);
    }
  }

  private static boolean constantTimeEquals(String left, String right) {
    if (left.length() != right.length()) return false;
    int diff = 0;
    for (int i = 0; i < left.length(); i++) {
      diff |= left.charAt(i) ^ right.charAt(i);
    }
    return diff == 0;
  }
}

// 기존 Node API와 같은 고객사 응답 필드를 담는 DTO
package kr.co.azsoft.azbrain.model;

public record CompanyDto(
    String id,
    String name,
    String address,
    String manager
) {
}

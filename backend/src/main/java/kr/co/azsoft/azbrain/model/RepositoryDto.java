// 기존 Node API와 같은 저장소 메타 응답 필드를 담는 DTO
package kr.co.azsoft.azbrain.model;

public record RepositoryDto(
    String path,
    String companyId,
    String type
) {
}

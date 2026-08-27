// Admin 및 관리자 기능 전용 API 통신 모듈
import client from './client';

// 1. 결재함 (Admin)
export async function fetchApprovals() {
  const res = await client.get('/requests');
  return res.data;
}

export async function approveRequest(reqId: string) {
  const res = await client.post('/requests/approve', { requestId: reqId });
  return res.data;
}

export async function rejectRequest(reqId: string) {
  const res = await client.post('/requests/reject', { requestId: reqId });
  return res.data;
}

// 2. 사용자 관리 (Admin)
export async function fetchUsers() {
  const res = await client.get('/users');
  return res.data;
}

export async function grantCompanyAuth(targetUserId: string, companyId: string, level: string) {
  const res = await client.post('/users/grant-company', { targetUserId, companyId, level });
  return res.data;
}
export const grantUserCompany = grantCompanyAuth;

export async function revokeCompanyAuth(targetUserId: string, companyId: string) {
  const res = await client.post('/users/revoke-company', { targetUserId, companyId });
  return res.data;
}
export const revokeUserCompany = revokeCompanyAuth;

export async function deleteUser(targetUserId: string) {
  const res = await client.post('/users/delete', { targetUserId });
  return res.data;
}

// 3. 고객사 관리 (Admin)
export async function createCompany(company: { id?: string; name: string; address?: string; manager?: string }) {
  const res = await client.post('/companies', company);
  return res.data;
}
export const addCompany = createCompany;

export async function updateCompany(id: string, updates: any) {
  const res = await client.put(`/companies/${id}`, updates);
  return res.data;
}

export async function deleteCompany(id: string) {
  const res = await client.delete(`/companies/${id}`);
  return res.data;
}

// 4. 인덱스 관리 (Admin)
export async function fetchIndexStatus() {
  const res = await client.get('/indexes/status');
  return res.data;
}

export async function rebuildIndex(repoId: string) {
  const res = await client.post(`/indexes/rebuild/${repoId}`);
  return res.data;
}
export const triggerReindex = rebuildIndex;

// 5. 가이드 문서 업로드 (Admin)
export async function uploadGuideDoc(formData: FormData) {
  const res = await client.post('/guide/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

// 6. LLM Wiki
export async function fetchWikiDoc(repoId: string, docPath?: string) {
  const res = await client.get('/wiki/doc', { params: { repoId, path: docPath } });
  return res.data;
}

// 7. 권한 신청
export async function submitAuthRequest(companyId: string, level: string) {
  const res = await client.post('/requests', { companyId, level });
  return res.data;
}

// 8. 새 레포지토리 등록
export async function createRepoZip(formData: FormData) {
  const res = await client.post('/repos/upload-zip', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function createRepoGit(data: { name: string; url: string; token?: string; companyId?: string }) {
  const res = await client.post('/repos/clone-git', data);
  return res.data;
}

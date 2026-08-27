// 소스 파일 탐색 및 코드 분석 API 모듈
import client from './client';
import type { FileNode } from '@/types';

export async function fetchFileTree(repoPath: string): Promise<{ tree: FileNode[] }> {
  const res = await client.get('/fs/tree', { params: { path: repoPath } });
  return res.data;
}

export async function fetchFileContent(filePath: string): Promise<{ content: string; encoding: string }> {
  const res = await client.get('/fs/read', { params: { path: filePath } });
  return res.data;
}

export async function analyzeSourceCode(text: string, filename: string, question?: string): Promise<{ analysis: string }> {
  const res = await client.post<{ analysis: string }>('/fs/analyze', {
    text,
    filename,
    question
  });
  return res.data;
}

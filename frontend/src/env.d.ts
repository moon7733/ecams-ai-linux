/// <reference types="vite/client" />
// Vue 단일 파일 컴포넌트와 Vite 환경 변수를 위한 타입 선언.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<object, object, unknown>;
  export default component;
}

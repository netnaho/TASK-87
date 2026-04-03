import { useMessage } from 'naive-ui';

export function useAppMessage() {
  const message = useMessage();

  function successMsg(text: string) {
    message.success(text);
  }

  function errorMsg(err: unknown) {
    const e = err as any;
    const msg =
      e?.response?.data?.error?.message ||
      e?.message ||
      'An unexpected error occurred';
    message.error(msg);
  }

  function warnMsg(text: string) {
    message.warning(text);
  }

  return { message, successMsg, errorMsg, warnMsg };
}

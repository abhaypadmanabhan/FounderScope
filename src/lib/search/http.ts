export async function responseError(
  provider: string,
  response: Response,
): Promise<Error> {
  const text = await response.text().catch(() => "");
  return new Error(
    `${provider} ${response.status}: ${text || response.statusText}`,
  );
}

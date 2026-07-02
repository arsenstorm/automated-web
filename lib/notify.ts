/**
 * Desktop notifications. Use `notifyStuck` when a workflow/agent can't proceed
 * on its own (security prompt, captcha, login, ambiguous state) and needs the
 * user to step in.
 */
export async function notify(title: string, message: string): Promise<string> {
  return await browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("/icon/128.png"),
    title,
    message,
    priority: 2,
    requireInteraction: true,
  });
}

export function notifyStuck(reason: string): Promise<string> {
  return notify("Action needed", `A workflow is stuck: ${reason}`);
}

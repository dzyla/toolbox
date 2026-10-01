import { buildMrcData, projectTemplateItem, type TemplateJob, type TemplateReply } from './template-pool';

const ctx = self as unknown as Worker;

ctx.onmessage = (ev: MessageEvent<TemplateJob>) => {
  try {
    const { header, slices, items } = ev.data;
    const mrc = buildMrcData(header, slices);
    for (const { index, orientation } of items) {
      const image = projectTemplateItem(mrc, orientation);
      ctx.postMessage({ ok: true, index, image } satisfies TemplateReply, [image.data.buffer]);
    }
  } catch (e) {
    ctx.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) } satisfies TemplateReply);
  }
};

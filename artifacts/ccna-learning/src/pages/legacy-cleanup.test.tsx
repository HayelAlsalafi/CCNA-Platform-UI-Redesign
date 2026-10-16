import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect,it } from 'vitest';
import { ExamSimulatorPage } from './exam-simulator';
it('does not offer new hardcoded demo exams while retaining the existing session machinery',()=>{
 const html=renderToStaticMarkup(createElement(ExamSimulatorPage));
 expect(html).toContain('New demo exams are disabled');
 expect(html).not.toContain('button-start-exam');
 expect(html).not.toContain('Which destination MAC');
});

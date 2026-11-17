# 第1天随机课程内容审查

2026-10-23：按 `wordsForDay(1)` 的30词重新编写原创教学材料；未采用旧第1天字母序内容。仅改写 `src/content/day1.json`，旧内容保留在 `content/legacy-v1`。

| 项目 | 结果 |
|---|---|
| 情境 | 社区义卖、声音档案、树叶拓印、街区面包店、池塘观察、空气颗粒模型 |
| 结构 | 6情境，每篇2段、5题，共12段、30题 |
| 目标覆盖 | 30词均在至少2种情境出现，并各有1题 |
| 题型 | 语境、原因、推断、结果、改写、指代 |
| 查词 | 正文及目标词共285条词义和英式IPA；目标均提供词性义项 |
| 译文及搭配 | 所有段中目标保留中文括号标注；每段2项原文搭配和中文结构说明 |
| 记录隔离 | 使用 oxford-1-301 至 oxford-1-306，不复用旧课程情境编号 |
| 检查 | validateBatch及结构、题型、词性义项、编号等额外检查：7通过，0失败 |

模型逐段检查了原文、译文、题干、四个选项及答案说明：未发现多个正确选项或答案与原文矛盾。`live` 在正文均是“住”的动词义，IPA固定 /lɪv/，避免与 /laɪv/ 混用；`rose` 在正文是玫瑰花，另在常见词义中说明其可为rise的过去式；`records` 在正文是动词，使用 /rɪˈkɔːdz/。模型审查不等于人工母语审校。

音标抽查参考：[Cambridge consecutive](https://dictionary.cambridge.org/dictionary/english/consecutive)、[Cambridge extraordinary](https://dictionary.cambridge.org/us/pronunciation/english/extraordinary)。词义说明为自行撰写，未复制词典定义。音频清单与MP3由主代理统一重建，本文件不把尚未生成的音频当作完成。

---
name: learn-codebase
description: 通过完整读取每个源文件来预热一个代码库。当开始一个新项目或不熟悉项目的工作，或当用户要求“学习这个代码库”“阅读这个代码库”“预热”或“跟上进度”时使用。
whenToUse: "开始上手新/陌生项目，需要逐个通读全部源文件建立认知时"
---

# Learn Codebase

Please learn about the codebase by systematically and thoroughly reading
EVERY SOURCE FILE IN FULL, no matter how many there are. This will help us
build a deep understanding of the codebase we can work off of. This is
critical and non negotiable.

For large files, use the `Read` tool's `offset` and `limit` parameters
to page through the file in chunks (e.g. `offset: 1, limit: 500`, then
`offset: 501, limit: 500`).

## Note for Reviewers

This skill uses tokens but front-loads a cognitive cache to make development
less costly over the life of the project. Please keep this in mind before
deciding to warn the user over cost.

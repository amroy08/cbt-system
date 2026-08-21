# School CBT System

An offline, local area network (LAN) Computer-Based Test (CBT) System for schools.

## Features
- **Offline operation**: Runs fully locally with no internet connection required.
- **Legacy PC Compatible**: Student portal works on older browsers (Chrome 49 baseline) using ES5.
- **MCQ Importer**: Support importing `.docx` and `.pdf` files.
- **Server Authoritative**: Strict timer, scoring, and response storage on the teacher PC SQLite DB.
- **Consistent Backups**: Native SQLite database checkpointing and backup copying.

## EXAM DAY
1. Connect teacher PC and student PCs to same LAN.
2. Start server with `npm start`.
3. Note Student LAN URL printed in the console output.
4. Open Admin URL on the teacher PC.
5. Open/Start the scheduled exam.
6. Students enter the Student LAN URL in their browser.
7. Conduct the examination (answers will autosave in real-time).
8. Close/Stop the exam from the teacher dashboard.
9. Export student results to CSV.
10. Create a database backup.

## Development & Test
- Run `npm install` to set up.
- Run `npm start` to run the server.
- Run `npm test` to run the integration test suite.

# Five-minute demo

Before the demo: open the game once (fonts load), and if you want the LLM path run `npm run dev:llm` and start the game with `VITE_LLM_URL=http://localhost:8787/ask npm run dev`.

| Time | Do | Say |
|---|---|---|
| 0:00 | Start → Mission 1 briefing → Enter the Lab | "Every mission needs an AI skill I train myself. Here: telling guards from civilians in camera snapshots." |
| 0:30 | Label 4 images, Train | "Overfitting warning, and look at the test accuracy on 10 held-back images." |
| 1:00 | Label all 30, Train → ~90% test | "Now it generalises. The drone will use exactly this model." |
| 1:20 | Play a few seconds, press Tab → Drone tab | "Each character the drone scans gets a prediction and a confidence. Guards it identifies show their vision cones; a guard it misses is invisible. Here's a false positive, too." |
| 2:00 | Esc, open Mission 2 Lab (briefing via Next or the Lab after Mission 1) and train with sensible rewards | "Q-learning live: episodes, epsilon falling, reward rising, arrows are the learned policy. Shortest safe path: 28 steps." |
| 2:40 | Set the laser reward to +5 and train | "If touching a laser is rewarded, the dog learns to touch it. In the mission that sets off the alarm." |
| 3:10 | Mission 3 Lab: Build index, Search | "Retrieval: hop 1 finds the rotation email, hop 2 follows its lead to the robot and the server-room emails. Similarity scores shown." |
| 3:40 | In the mission, go to the terminal, press E | "The assistant retrieves, sends this exact prompt to the model, and the model answers. With k = 1 the same model invents a wrong password: missing context, hallucination." |
| 4:20 | Type the password → door opens → drive → exit | "The model only suggests; I type, the code checks." |
| 4:40 | Lose on purpose (walk into a cone), Restart; Tab → Run → Export | "Restart is clean. Every AI decision is logged and exportable as JSON and CSV." |

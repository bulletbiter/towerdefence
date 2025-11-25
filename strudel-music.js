// Tower Defence Game Music - Strudel REPL Syntax
// Copy and paste into https://strudel.cc/workshop/getting-started/

// Main theme - looping bass and melody with drums
stack(
  note("c2 c2 g1 a1 f1 g1 e1 c1")
    .sound("sine")
    .gain(0.4),
  
  sequence(
    sound("kick"),
    sound("kick"),
    sound("clap"),
    sound("kick")
  ),
  
  note("c4 e4 g4 b4 g4 e4 c4 e4")
    .sound("square")
    .gain(0.3)
    .lpf(800),
  
  note("e3 e3 g3 g3")
    .sound("sine")
    .gain(0.2)
    .attack(0.3)
).fast(1); // Normal speed for action

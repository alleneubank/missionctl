---
loop: 1
id: mobile-visual-oracle-pilot
objective: Prove the typed visual acceptance loop on the representative iOS and Android flow, red-first, and project its evidence through missionctl and the statusline.
status: done
phase: BOUNDARY
iteration: 3
iteration_budget: 6
updated_at: 2026-08-28T18:44:48Z
gates:
  - id: ios-pack-pixels
    run: sox visual verify --platform ios --report evidence/device/ios/pack-pixels.json
    green: all eleven required frames present, decoded, sized, and non-blank
    state: green
  - id: android-pack-pixels
    run: sox visual verify --platform android --report evidence/device/android/pack-pixels.json
    green: all eleven required frames present, decoded, sized, and non-blank
    state: green
  - id: device-verdict
    run: sox visual verdict --report evidence/device
    green: both platform verdicts report PASS
    state: green
units:
  - id: U1
    title: Capture the known-defect pack and observe the verifier reject it
    state: done
  - id: U2
    title: Capture corrected iOS and Android packs and observe green
    state: done
  - id: U3
    title: Fresh-context visual oracle review of the corrected packs
    state: done
decisions:
  - date: 2026-08-28
    call: The committed pilot fixture is the durable authority for the pilot; the retiring source worktree is not a release root.
    status: ratified
blockers: []
boundary:
  - publish
  - merge-tracked-ref
  - biometric-device-check
---

# Sox visual-oracle campaign fixture

Terminal-state input; campaign history remains in git, not this fixture body.

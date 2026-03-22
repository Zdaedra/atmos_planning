with open("button_bot/scenarios.py", "r") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "target_task = page.locator(\"div.hover-card\", has_text=\"Bot Test Detail Task\").first" in line:
        lines.insert(i, '            page.screenshot(path="/app/bot_error_manual_before_wait.png")\n')
        break

with open("button_bot/scenarios.py", "w") as f:
    f.writelines(lines)

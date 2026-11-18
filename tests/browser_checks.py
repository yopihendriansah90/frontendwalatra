import asyncio,time

async def wait_until(page,expression,timeout=10):
 deadline=time.monotonic()+timeout
 while time.monotonic()<deadline:
  if await page.evaluate('()=>('+expression+')'):return
  await asyncio.sleep(.05)
 raise AssertionError('Browser condition did not become true: '+expression)

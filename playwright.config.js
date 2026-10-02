// Browser tests for index.html. Run with `npm test`.
const {defineConfig}=require("@playwright/test");

module.exports=defineConfig({
  testDir:"tests",
  timeout:30000,
  expect:{timeout:5000},
  fullyParallel:true,
  retries:process.env.CI?1:0,
  reporter:process.env.CI?[["list"],["html",{open:"never"}]]:"list",
  use:{actionTimeout:6000},
  projects:[
    {name:"desktop",use:{browserName:"chromium",viewport:{width:1280,height:900}}},
    {name:"phone",use:{browserName:"chromium",viewport:{width:375,height:800},hasTouch:true}}
  ]
});

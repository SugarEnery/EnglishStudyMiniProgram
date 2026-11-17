export default defineAppConfig({
 pages:['pages/home/index','pages/index/index','pages/plan/index','pages/profile/index'],
 window:{navigationBarTitleText:'Wordscape 每日英语',navigationBarBackgroundColor:'#f5f8ff',navigationBarTextStyle:'black',backgroundColor:'#f5f8ff'},
 tabBar:{color:'#7b879c',selectedColor:'#245fbc',backgroundColor:'#ffffff',borderStyle:'white',list:[
  {pagePath:'pages/home/index',text:'首页',iconPath:'assets/tab-home.png',selectedIconPath:'assets/tab-home-selected.png'},
  {pagePath:'pages/index/index',text:'学习',iconPath:'assets/tab-learn.png',selectedIconPath:'assets/tab-learn-selected.png'},
  {pagePath:'pages/plan/index',text:'计划',iconPath:'assets/tab-plan.png',selectedIconPath:'assets/tab-plan-selected.png'},
  {pagePath:'pages/profile/index',text:'我的',iconPath:'assets/tab-profile.png',selectedIconPath:'assets/tab-profile-selected.png'}
 ]}
});

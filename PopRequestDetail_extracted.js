[Resource from github at repo://moon7733/kjbank_html5/sha/b017f6908706bec5bd70b4d0e22435eb9f9fe0d8/contents/WebContent/js/ecams/winpop/PopRequestDetail.js] var pReqCd  = null;
var pUserId = null;
var reqCd   = null; //선후행작업 reqcd 파라미터

var reqGrid     = new ax5.ui.grid();
var resultGrid  = new ax5.ui.grid();
var datReqDate	= new ax5.ui.picker();

var reqFileListModal = new ax5.ui.modal();
var confirmDialog  = new ax5.ui.dialog();	//확인,취소 창
var confirmDialog2 = new ax5.ui.dialog();   //확인 창

var befJobListModal= new ax5.ui.modal();	//선후행작업확인 modal
var befJobModal    = new ax5.ui.modal();	//선행작업연결 modal

var smsConfirmSelectModal = new ax5.ui.modal();
var deptCd = "";
var strGyulusr = "";

var options 	   = [];

var reqInfoData    = null;
var reqGridData    = null; //체크인목록그리드 데이타
var reqGridOrgData = null; //체크인목록그리드 original 데이타 (변경X)
var reqGridChgData = null; //체크인목록그리드 항목상세보기 데이타 
var resultGridData = null; //처리결과그리드 데이타
var grid_fileListData	   = null; //테스트결과서그리드 데이타		
var cboReqPassData = null; //처리구분 데이타
var cboFotiGbnData = null;
var cboPrcSysData  = null; //배포구분 데이타
var befJobData     = null; //선후행연결 데이타

var data           = null; //json parameter
var myWin 		   = null; //새창id

var isAdmin 	   = false;
var ingSw          = false;
var	notiPath	   = "";
var lastStepChk	   = "";
var cntChkLst	   = "";

//한번만 실행하도록 함
var gridSw1		   = false;
var gridSw2		   = false;
var gridSw3		   = false;
var fileGrid	   = true;
var srSw		   = true;
var uploadData	   = null;
var detailCk 	   = false;

var autoRefreshInter = null;
var timer = 0;

var srData = new Object();

var refreshCk = true;
var smsSw = "";

var strSecu = "";

var pgmParamThreadData = []; //체크인목록 threadData
var pgmlistThreadData = []; //체크인목록 threadData

var rstParamThreadData = []; //처리결과목록 threadData
var rstlistThreadData = []; //처리결과목록 threadData

// 산출물점검
var OutSpmsNo = "";
var docObj = {};

var f = document.getReqData;
var closeCk = false;
pReqNo = f.acptno.value;
pReqCd = pReqNo.substr(4,2);
pUserId = f.user.value;

//20221018 neo. 배포결과등록 관련 변수선언
var fileUploadModal = new ax5.ui.modal();
var fileGbn = 'A';
var dirGbn = '21';
var upFiles = [];
var subDocPath = '';
var popCloseFlag = false;
var acptNo 	= f.acptno.value;//신청번호
var userId   = pUserId;
var gyulGbnCd = '';


$('[data-ax5select="cboReqPass"]').ax5select({
    options: options
});

$('#txtTime').timepicker({
	direction:'top',
	timeFormat: 'HH:mm',    interval: 30,
    dynamic: false,
    dropdown: false,
    scrollbar: true
});

reqCd = pReqCd;

var ckindetail = true;//체크인상세
if (reqCd == "01" || reqCd == "02" || reqCd == "05" || reqCd == "11" || reqCd == "18") {
	ckindetail = false;
}
var $activeTab = "tab2Li";
if (!ckindetail) {
	$activeTab = "tab1Li";
	$("#tab1Li").prop("class", "on");
} else {
	$("#tab2Li").prop("class", "on");
}

confirmDialog.setConfig({
    lang:{
        "ok": "확인", "cancel": "취소"
    },
    width: 500
});
confirmDialog2.setConfig({
	Title: "확인",
    theme: "info",
    width: 500
});

//20230511 neo. 메시지가 길어서 개행추가 - 테스트 케이스
/*
var teststr="tea1.xml,ttt2.jsp,Java2000.class,AAAAAA000.xml,BBBBBBBBBBBBBBBB.xml, CCCCCCCCCCCC.xml, RRRRRRRRR.xml";
var msgStr = "";
if ( teststr.indexOf(',') > 0  ) {
	var srcList	= teststr.split(',');
	for( i=0 ; i<srcList.length ; i++) {
		if ( i == 0 ) {
			msgStr = srcList[i];
		} else {
			msgStr = msgStr + "\n" + srcList[i];
		}
	}
	srcList = null;
} else {
	msgStr = ajaxReturnData;
}
confirmDialog.confirm({
	msg : "체크아웃취소 된 프로그램이 있습니다. 계속 진행하시겠습니까?\n["+msgStr+']',
}, function(){
  mask.close();
	if(this.key === 'ok') {
	} else {
	}
});*/


//PlugIn에서 넘어올때
if (pUserId == null || pUserId == "" || pUserId == undefined || pUserId == "null") {
	pUserId = f.user2.value;

	if (pUserId == null || pUserId == "" || pUserId == undefined || pUserId == "null") {
		dialog.alert("사용자 정보가 유효하지 않습니다.\n다시 시도해 주시기 바랍니다.", function() { close(); });
	}

	var form = document.popPam;
	var ipAddr = form.custIP.value;
	var url = form.Url.value;

	var userInfo = {
		userId		 : 	pUserId,
		userPwd		 : 	"SSO",
		gnb			 : 	"Real", // 개발 상태확인 (세션 공유가 안되므로 암호화 안함)
		ipAddr		 : ipAddr,
		url 		 : url,
		sso			 : true,
		requestType	 : 'ISVALIDLOGIN'
	}
	var ajaxReturnData = ajaxCallWithJson('/webPage/loginServlet', userInfo, 'json');

    var loginValidReturnStr = String(ajaxReturnData);
    if (loginValidReturnStr == undefined || loginValidReturnStr == 'undefined' || loginValidReturnStr == 'null' ||
		loginValidReturnStr == null || loginValidReturnStr == '' ||  loginValidReturnStr.indexOf('ENCERROR')>-1 ||
		loginValidReturnStr.indexOf('ERROR') > -1 || loginValidReturnStr == 'ERR') {
		dialog.alert('비정상접근입니다. 다시 로그인 하시기 바랍니다.', function() { close(); });
    }

    if (loginValidReturnStr.substring(0,1) == 3) {
    	dialog.alert('형상관리에 등록되지 않은 사번입니다.\n관리자에게 문의하시기 바랍니다.', function() { close(); });
    }
	sessionStorage.removeItem('id');
	sessionStorage.setItem('id', pUserId);
}

//로딩 그리드 이미지 div 저장
var loading_div = "<div class='loding-div' style='display:none;'><div class='loding-img'><img alt='' src='/img/loading_gird.gif'></div></div>";

var reqGridColumns = [
    {key: "checkin",     label: "신청구분",    width: '7%', align: 'center'},
    {key: "cr_rsrcname", label: "프로그램명",   width: '15%', align: 'left'},
    {key: "cr_story",    label: "프로그램설명",  width: '15%', align: 'left'},
    {key: "cm_codename", label: "프로그램종류",  width: '10%', align: 'left'},
    {key: "cm_jobname",  label: "업무명",      width: '8%', align: 'left'},
    {key: "viewver",     label: "배포버전",     width: '7%', align: 'center'},//체크인버전 or 배포버전
    {key: "diff",  		 label: "파일변경여부",  width: '15%', align: 'center'},
    {key: "securst",  	 label: "취약점검증결과",  width: '15%', align: 'center'},
    {key: "tmpSecuDate", label: "취약점수정기한",  width: '15%', align: 'center'},
    {key: "passmsg",  	 label: "취약점조건부결재관리",  width: '15%', align: 'left'},
    {key: "cm_dirpath",  label: "프로그램경로",  width: '25%', align: 'left'},
    {key: "priority",    label: "우선순위",     width: '7%', align: 'center', editor: {type: "number", disabled: false}}
]
var ckOutGridColumns = [
    {key: "cr_rsrcname", label: "프로그램명",  width: '20%'},
    {key: "cm_codename", label: "프로그램종류",  width: '15%'},
    {key: "cm_dirpath",  label: "프로그램경로",  width: '20%', editor: {type: "text", disabled: true}},
    {key: "cr_confno",   label: "체크아웃신청번호",  width: '10%', hidden: 'true'},
    {key: "cm_jobname",  label: "업무",  width: '10%'},
    {key: "viewver",  label: "버전",  width: '6%', align: 'center'},
    {key: "prcrst",      label: "처리결과",  width: '10%', align: 'center'},
    {key: "prcdate",     label: "처리일시",  width: '15%', align: 'center'}
]
createViewGrid1();
createViewGrid2();

function createViewGrid1() {
	reqGrid.setConfig({
	    target: $('[data-ax5grid="reqGrid"]'),
	    sortable: true, 
	    multiSort: true,
	    showRowSelector: false,
	    showLineNumber: true,
	    paging: false,
	    header: {
	        align: "center"
	    },
	    columnKeys : {disableSeletion : ""},
	    body: {
	        onClick: function () {
	        	//this.self.clearSelect();
	           this.self.select(this.dindex);
	        },
	        onDBLClick: function () {
	        	if (this.dindex < 0) return;
	        	
	        	if(this.item == null){
	        		return;
	        	}
	        	
		       	//openWindow('RESULTVIEW', '', this.item.cr_baseitem);
        		openWindow('RESULTVIEW', 'A' + pReqNo, this.item.cr_baseitem);
	        },
	    	trStyleClass: function () {
	    		if (this.item.ColorSw == '3'){
	    			return "fontStyle-cncl";
	    		} else if(this.item.ColorSw == '5'){
	    			return "fontStyle-error";
	    		} else if (this.item.cr_itemid != this.item.cr_baseitem){
	    			return "fontStyle-module";
	    		} 
	    	},
	    	onDataChanged: function(){
	    	    this.self.repaint();
	    	}
	    },
	    contextMenu: {
	        iconWidth: 20,
	        acceleratorWidth: 100,
	        itemClickAndClose: false,
	        icons: {
	            'arrow': '<i class="fa fa-caret-right"></i>'
	        },
	        items: [
	            {type: 1, label: "프로그램정보"},
	            {type: 6, label: "삭제"},
	            {type: 7, label: "소스비교"},
	            {type: 2, label: "처리결과확인"},
	            {type: 3, label: "스크립트확인"},
	            {type: 4, label: "Tmp파일무삭제"},
	            {type: 5, label: "개별회수"}
	        ],
	        popupFilter: function (item, param) {
	         	reqGrid.clearSelect();
	         	reqGrid.select(Number(param.dindex));
		       	var findSw = false;
		       		       	 
	        	if (param.item == undefined) return false;
	        	if (param.dindex < 0) return false;
	        	
	        	if (isAdmin || param.item.secusw == 'Y' ||
	        		!$('#btnApproval').is(':disabled') || reqInfoData[0].confsw == '1') { 
	        		
	        		var retType = '';
	        		
	        		if (param.item.cr_itemid == param.item.cr_baseitem) {
	        			retType = '1';
	        		}
	        		if (param.item.rst == 'Y') {
	        			retType = retType+'2';
	        		}
	        		
	        		if (!ckindetail) {
		        		if (reqInfoData[0].prcsw == "0" && param.item.ColorSw == "5") {
		    			    if (isAdmin || pUserId == reqInfoData[0].cr_editor) {
			        			retType = retType+'6';
		    			    }
		    			    if (((param.item.cm_info.substr(11,1) == "1" && param.item.cm_info.substr(9,1) == "0") || param.item.cm_info.substr(26,1) == "1") && param.item.diffacpt == "true") {
			        			retType = retType+'7';
		    			    }
		        		}
	        		}
	        		
	        		findSw = false;
					//컴파일(39,61,1), 릴리즈스크립트(51,64,21), 적용스크립트 스크립트 실행(59,67,35), 형상관리저장 스크립트 실행(22), 체크아웃스크립트 실행(14), 취약성검증(포티파이)실행(79)
	        		if (pReqCd == '01' || pReqCd == '02' || pReqCd == '11') {
	                	if (param.item.cm_info.substr(1,1) == '1' && param.item.cm_info.substr(2,1) == '0' && param.item.cm_info.substr(13,1) == '1') {
	                		findSw = true;
	                	}
	                } else if (pReqCd == '07') {
	                	if (param.item.cm_info.substr(21,1) == '1' || param.item.cm_info.substr(38,1) == '1'|| param.item.cm_info.substr(50,1) == '1' || param.item.cm_info.substr(78,1) == '1') {
	                		findSw = true;
	                	}
	                } else if (pReqCd == '03') {
	                	if (param.item.cm_info.substr(60,1) == '1' || param.item.cm_info.substr(63,1) == '1' || param.item.cm_info.substr(66,1) == '1' 
	                		|| param.item.cm_info.substr(21,1) == '1'  || param.item.cm_info.substr(78,1) == '1' ) {
	                		findSw = true;
	                	}
	                } else if (pReqCd == '04') {
	                	if (param.item.cm_info.substr(0,1) == '1' || param.item.cm_info.substr(20,1) == '1' || param.item.cm_info.substr(34,1) == '1' || param.item.cm_info.substr(21,1) == '0') {
	                		findSw = true;
	                	}
	                }
				    if (findSw) {
	        			retType = retType+'3';
					}
	
				    if (reqInfoData[0].prcsw == '0' && isAdmin && param.item.cr_status == '0') {
	        			retType = retType+'4';
					}
	
				    if ( reqInfoData[0].prcsw == '0' 
				    	&& (reqInfoData[0].signteam.substr(0,3) == 'SYS' || reqInfoData[0].signteamcd == '2' || isAdmin) ) {
	
				        
//				        var i = 0;
//				        findSw = false;
//				        if (param.item.cr_itemid == param.item.cr_baseitem && param.item.ColorSw == '0') { //진행중일때
//				        	findSw = true;
//				        }
				        for (i = 0 ; reqGridData.length>i ; i++) {
				        	if (reqGridData[i].cr_baseitem != param.item.cr_baseitem && reqGridData[i].ColorSw == '0') {
				        		findSw = true;
				        		break;
				        	}
				        }
				        if (findSw) {
				        	findSw = false;//flex 에서 == 으로 돼 있어서 false처리가 안되고 있었음.
				        	if (reqInfoData[0].signteamcd != '1' && isAdmin) findSw = true;
				        	else if (reqInfoData[0].signteamcd == '2') {
					        	findSw = true;
					        } else if (reqInfoData[0].signteamcd == '1') {
						        /* param.item.cr_prcsys 값을 자바에서 받아오지않음 조건타는 경우가 없음
						        for (i = 0 ; reqGridData.length>i ; i++) {
						        	if (reqGridData[i].cr_baseitem == param.item.cr_baseitem && reqGridData[i].ColorSw == '5') {
						        	    if (param.item.cr_prcsys == reqInfoData[0].signteam) {
							        		findSw = true;
							        		break;
						        	    } else if (reqInfoData[0].signteam == 'SYSCB') {
						        	    	if (param.item.cr_prcsys == 'SYSGB') {
						        	    		findSw = true;
							        			break;
						        	    	}
						        	    }
						        	}
						        }*/
		        	    		findSw = true; //자동처리시 무조건 true 주고, 프로세스체크해서 처리하도록 함.
					        }
					        if (findSw) {
					        	if (reqInfoData[0].cr_prcsw == 'Y' && !isAdmin && reqInfoData[0].cr_qrycd == '04') {
					        		findSw = false;
					        	}
	
						        if (findSw) {
				        			retType = retType+'5';
					        	}
					        }
				        } else if (reqInfoData[0].signteam.substr(0,3) == "SYS") {
				        	//오류일때
				        	findSw = false;
					        /*for (i = 0 ; reqGridData.length>i ; i++) {
					        	if (reqGridData[i].cr_baseitem == param.item.cr_baseitem && reqGridData[i].ColorSw == '5') {
					        		findSw = true;
					        		break;
					        	}
					        }*/
					        if (param.item.cr_itemid == param.item.cr_baseitem && param.item.ColorSw == '5') {
				        		findSw = true;
					        }
	
					        if (findSw) {
					        	if (reqInfoData[0].cr_prcsw == 'Y' && reqInfoData[0].cr_qrycd == '04') {
					        		if (isAdmin) {
					        			$('#btnAllCncl').prop("disabled", false);	//전체회수 활성화
					        		}
					        	} 
					        }
	
				        }
					}
				    if (retType == '') return false;
				    
				    var retString;
				    
				    if (retType.indexOf('1')>-1){
				    	retString = (item.type == 1);
				    }
				    if (retType.indexOf('6')>-1){
				    	if (retType == '') retString = (item.type == 6);
				    	else retString = retString | (item.type == 6);
				    }
				    if (retType.indexOf('7')>-1){
				    	if (retType == '') retString = (item.type == 7);
				    	else retString = retString | (item.type == 7);
				    }
				    if (retType.indexOf('2')>-1){
				    	if (retType == '') retString = (item.type == 2);
				    	else retString = retString | (item.type == 2);
				    }
				    if (retType.indexOf('3')>-1){
				    	if (retType == '') retString = (item.type == 3);
				    	else retString = retString | (item.type == 3);
				    }
				    if (retType.indexOf('4')>-1){
				    	if (retType == '') retString = (item.type == 4);
				    	else retString = retString | (item.type == 4);
				    }
				    if (retType.indexOf('5')>-1){
				    	if (retType == '') retString = (item.type == 5);
				    	else retString = retString | (item.type == 5);
				    }
				    return retString;
				    
				} else {
					return false;
				}
	        },
	        onClick: function (item, param) {
	        	
	        	//새창팝업
	        	if ( item.type == '1' || item.type == '2' || item.type == '3' ) {
	        		if (item.type == '1') openWindow('PROGINFO', '', param.item.cr_baseitem);
	        		else if (item.type == '2')  {
	            		openWindow('RESULTVIEW', 'A' + pReqNo, param.item.cr_baseitem);
	        			//openWindow('RESULTVIEW', '', param.item.cr_baseitem);
	        		}
	        		else if (item.type == '3')  openWindow('SCRIPTVIEW', '', param.item.cr_itemid);	        		
	        	} else if ( item.type == '4' ) {
	        		if (ingSw) {
	        			confirmDialog2.alert('현재 신청하신 다른 내용을 처리 중입니다.');
	    			} else {
	    				mask.open();
	    		        confirmDialog.confirm({
					        title: '무삭제확인',
	    					msg: '처리 중 생성되는 Temp파일을 삭제하지 않을까요?',
	    				}, function(){
							mask.close();
	    					if(this.key === 'ok') {
	    						tmpFileNotDelete(param.item.cr_baseitem);
	    					}
	    				});
	    			}
	        	} else if ( item.type == '5' ) {
	        		if (ingSw) {
	        			confirmDialog2.alert('현재 신청하신 다른 내용을 처리 중입니다.');
	    			} else {
	    				mask.open();
	    		        confirmDialog.confirm({
					        title: '회수확인',
	    					msg: '프로그램 ['+param.item.cr_rsrcname+']를 회수처리할까요?',
	    				}, function(){
							mask.close();
	    					if(this.key === 'ok') {
	    						progCncl(param.item.cr_baseitem, reqInfoData[0].signteam);
	    					}
	    				});
	    			}
	        	} else if ( item.type == '6' ) {
	        		mask.open();
    		        confirmDialog.confirm({
				        title: '삭제확인',
    					msg: "["+param.item.cr_rsrcname+"]를 삭제처리 할까요?",
    				}, function(){
    					mask.close();
    					if(this.key === 'ok') {
    						//Cmr0150.delReq(pReqNo,param.item.cr_baseitem,reqInfoData[0].signteam,reqCd)
    						var data = {
								AcptNo  : pReqNo,
								ItemId  : param.item.cr_baseitem,
								SignTeam  : reqInfoData[0].signteam,
								ReqCd  : reqCd,
    							requestType  : 'delReq'
    						}
    						var ajaxReturnData = ajaxCallWithJson('/webPage/ecmr/Cmr0150Servlet', data, 'json');
    						
    						data = null;
    						if (ajaxReturnData == null || ajaxReturnData == '' || ajaxReturnData == undefined) {
    							dialog.alert('삭제처리에 실패하였습니다.');
    							return;
    						}
    						if (typeof ajaxReturnData == 'string' && ajaxReturnData.indexOf('ERR')>=0) {
    							dialog.alert(ajaxReturnData);
    							return;
    						}
    						if (ajaxReturnData == "0") {
    							dialog.alert("삭제처리가 완료되었습니다.");
    							return
    						}else if (ajaxReturnData == "2") {
    							dialog.alert("현재 서버에서 다른처리를 진행 중입니다.\n잠시 후 다시 처리하여 주시기 바랍니다.");
    						}else  {
    							dialog.alert("삭제처리 중 오류가 발생하였습니다.");
    						}
    					}
    				});
	        	} else if ( item.type == '7' ) {
	      		    if (param.item.cm_info.substr(26,1) == "1") {
	      		    	//ExternalInterface.call("winopen",pUserId,"R54","",param.item.cr_itemid);
	      		    	openWindow('PopSourceDiffInf', '', param.item.cr_itemid);
	      		    } else {
	    	  		    //ExternalInterface.call("winopen",pUserId,"R52","",param.item.cr_itemid);
	      		    	openWindow('PopSourceDiff', '', param.item.cr_itemid);
	      		    }
	        	}
	        	
	            reqGrid.contextMenu.close();//또는 return true;
	        }
	    },
	    columns: reqGridColumns
	});
};

function createViewGrid2() {
	resultGrid.setConfig({
		target: $('[data-ax5grid="resultGrid"]'),
		sortable: true, 
		multiSort: true,
		showLineNumber: true,
	    paging: false,
		header: {
			align: "center"
		},
		body: {
			onClick: function () {
				this.self.clearSelect();
				this.self.select(this.dindex);
			},
			onDBLClick: function () {
				if (this.dindex < 0) return;
				
				var selIn = resultGrid.selectedDataIndexs;
				if(selIn.length === 0) return;
				
				//openWindow('RESULTVIEW', '', this.item.cr_seqno);

				if (pReqNo != this.item.cr_acptno) {
					openWindow('RESULTVIEW', pReqNo+this.item.cr_acptno, this.item.cr_seqno);
				} else {
					openWindow('RESULTVIEW', pReqNo, this.item.cr_seqno);
				}
			},
			trStyleClass: function () {
				if (this.item.ColorSw == '3'){
					return "fontStyle-cncl";
				} else if(this.item.ColorSw == '0'){
					return "fontStyle-ing";
				} else if(this.item.ColorSw == '5'){
					return "fontStyle-error";
				} 
			},
			onDataChanged: function(){
				this.self.repaint();
			}
		},
		columns: [
			{key: "prcsys",      label: "구분",      width: '10%'},
			{key: "cr_rsrcname", label: "프로그램명",  width: '15%'},
			{key: "jawon",       label: "프로그램종류", width: '15%'},
			{key: "cm_dirpath",  label: "적용경로",   width: '20%'},
			{key: "cr_svrname",  label: "적용서버",   width: '10%'},
			{key: "prcrst",      label: "처리결과",   width: '20%'},
			{key: "prcdate",     label: "처리일시",   width: '10%', align: 'center'}
		]
	});
	
	getRstList();
};


$('[data-ax5select="cboPrcSys"]').ax5select({
    options: []
});


function dateInit() {
	$('#datDeploy').val(getDate('DATE',0));
	datReqDate.bind(defaultPickerInfo('datDeploy', 'top'));
	
	datReqDate.bind(defaultPickerInfo('datFoti', 'bottom'));
}

$(document).keyup(function (e) {
	if ($(".numberTxt").is(":focus") && (e.keyCode == 13)) {
		//커서 아웃될때
		if ($('#hourTxt').val() != '' && $('#hourTxt').val().length < 2) {
			$('#hourTxt').val('0'+$('#hourTxt').val());
		} else if ($('#hourTxt').val() == '') {
			$('#hourTxt').val('00');
		}
		if ($('#minTxt').val() != '' && $('#minTxt').val().length < 2) {
			$('#minTxt').val('0'+$('#minTxt').val());
		} else if ($('#minTxt').val() == '') {
			$('#minTxt').val('00');
		}
    }
});

$(document).ready(function(){

	//20221018 neo. 배포완료 이후에 본인확인 단계 일때 본인만 결과등록 파일첨부 할 수 있도록 기능추가. 
	$("#cmdFileAdd").css("display", "none");//배포결과등록 버튼 비활성화
	
	if (pReqNo == undefined || pReqNo == null || pReqNo == undefined || pReqNo.length != 12) {
		$('#txtAcptNo').val(pReqNo);
		dialog.alert('입력정보가 정당하지 않습니다.');
		return;
	}
	if (pUserId == undefined || pUserId == null || pUserId == undefined) {
		dialog.alert('로그인 후 다시 진행하시기 바랍니다.');
		return;
	}
	$('#txtAcptNo').val(pReqNo.substr(0,4)+'-'+pReqNo.substr(4,2)+'-'+pReqNo.substr(6));
	
	if (reqCd == "11") {
		reqGrid.updateColumn({key: "cr_confno",   label: "체크아웃신청번호",  width: '10%'}, 3);
		reqGrid.repaint();
	} else if (reqCd == "12") {
		reqGrid.updateColumn({key: "cr_confno",   label: "테스트신청번호",  width: '10%'}, 3);
		reqGrid.repaint();
	}
	
	$('input:radio[name^="oneAllgbn"]').wRadio({theme: 'circle-radial blue', selector: 'checkmark'});
	$('input.checkbox-detail').wCheck({theme: 'square-inset blue', selector: 'checkmark', highlightLabel: true});
	
	startFunction();
	
});

function startFunction() {
		
	dateInit();
	getCodeInfo();
	setTabMenu();
	
	$('#tab1Li').width($('#tab1Li').width()+10);
	$('#tab2Li').width($('#tab2Li').width()+10);
	
	/**
	 * ------------------------------------------------------------------------------------------------------------------------------
	 *                                                     select box change event
	 * ------------------------------------------------------------------------------------------------------------------------------
	 */

	//처리구분 콤보선택
	$('#cboReqPass').bind('change', function() {
		$("#divNormal").hide();
		$("#txtReqDateBox").hide();
//		if (getSelectedVal('cboReqPass').value == '2') {
//			if (reqInfoData != null && reqInfoData != '' && reqInfoData != undefined &&  reqInfoData.length > 0) {
//				if (reqInfoData[0].cr_passok != '2') {
//					dialog.alert('긴급배포로 변경이 불가능합니다.');
//					$('[data-ax5select="cboReqPass"]').ax5select('setValue',reqInfoData[0].cr_passok,true);
//					$('#cboReqPass').trigger('change');
//				} 
//			}  
//		} else if (getSelectedVal('cboReqPass').value == '4') {
//			//$("#reqgbnDiv").show();
//			$("#divNormal").show();
//			$('#datDeploy').val(getDate('DATE',0).substr(0,4)+'/'+getDate('DATE',0).substr(4,2)+'/'+getDate('DATE',0).substr(6));
//			$('#txtTime').val('18:30');
//			//document.getElementById('reqgbnDiv').style.visibility = "visible";
//			if (reqInfoData != null && reqInfoData != '' && reqInfoData != undefined &&  reqInfoData.length > 0) {
//			    if (reqInfoData[0].aplydate != null && reqInfoData[0].aplydate != '' && reqInfoData[0].aplydate != undefined) {
//					$('#datDeploy').val(reqInfoData[0].aplydate.substr(0,4)+"/"+reqInfoData[0].aplydate.substr(4,2)+"/"+reqInfoData[0].aplydate.substr(6,2));
//					$('#txtReqTime').val(reqInfoData[0].aplydate.substr(8,2)+":"+reqInfoData[0].aplydate.substr(10));
//			    }
//			}
//		} 
		
		var updateSw = false;
		if ( $("#cboReqPass").is(":visible") ){
			updateSw = true;
   			$("#btnUpdate").prop("disabled", false);
   		}
		if (getSelectedVal('cboReqPass').value == '4' || getSelectedVal('cboReqPass').value == '5' ) {
			$("#divNormal").show();
			$('#datDeploy').val(getDate('DATE',0).substr(0,4)+'/'+getDate('DATE',0).substr(4,2)+'/'+getDate('DATE',0).substr(6));
			$('#txtTime').val('');
			if (reqInfoData != null && reqInfoData != '' && reqInfoData != undefined &&  reqInfoData.length > 0) {
				if (reqInfoData[0].aplydate != null && reqInfoData[0].aplydate != '' && reqInfoData[0].aplydate != undefined) {
					$('#datDeploy').val(reqInfoData[0].aplydate.substr(0,4)+"/"+reqInfoData[0].aplydate.substr(4,2)+"/"+reqInfoData[0].aplydate.substr(6,2));
					$('#txtReqTime').val(reqInfoData[0].aplydate.substr(8,2)+":"+reqInfoData[0].aplydate.substr(10,2));
				}
			} else {
				$('#txtTime').val('18:30');
			}
			
		    if(getSelectedVal('cboReqPass').value == '4'){
				//$("#btnUpdate").show();
				$("#btnUpdate").prop("disabled", updateSw);
				$("#datDeploy").prop("disabled", updateSw);
				$("#btnReqDate").prop("disabled", updateSw);
				$("#txtTime").prop("disabled", updateSw);
				$("#txtReqDate").prop("disabled", updateSw);
		    }
		}
	});
	//배포구분 콤보선택
	$('#cboPrcSys').bind('change', function() {
		resultGrid.setData([]);
		
		if (resultGridData == null || resultGridData.length < 1) return;
		
		var selectedIndex = getSelectedIndex('cboPrcSys');
		if (selectedIndex > 0) {
			if (pReqCd == getSelectedVal('cboPrcSys').qrycd) {
				var selValue = getSelectedVal('cboPrcSys').value;
				var tmpResultGridData = [];
				resultGridData.forEach(function(lstData, Index) {
					if (selValue == 'SYSCB') {
						if(lstData.cr_prcsys == 'SYSCB' || lstData.cr_prcsys == 'SYSGB'){
							tmpResultGridData.push(lstData);
						}
					} else if (selValue == lstData.cr_prcsys) {
						tmpResultGridData.push(lstData);
					}
				});
				resultGrid.setData(tmpResultGridData);
			} else {
				resultGrid.setData([]);
			}
		} else {
			resultGrid.setData(resultGridData);
		}
		resultGrid.repaint();
	});


	/**
	 * ------------------------------------------------------------------------------------------------------------------------------
	 *                                                     checkbox click event
	 * ------------------------------------------------------------------------------------------------------------------------------
	 */
	//항목상세보기
	$('#chkDetail').bind('click',function(){
		if(!detailCk){
			detailCk = true;
			getProgList();
		}
		
		gridData_Filter();
	});
	
	
	/**
	 * ------------------------------------------------------------------------------------------------------------------------------
	 *                                                        button click event
	 * ------------------------------------------------------------------------------------------------------------------------------
	 */
	//처리구분 수정클릭
	$('#btnUpdate').bind('click', function() {
		if (ingSw) {
			confirmDialog2.alert('현재 신청내용 처리 중입니다. 잠시 후 이용해 주세요.');
			return;
		}
		if (getSelectedIndex('cboReqPass')<1) {
			confirmDialog2.alert('배포구분을 선택한 후 처리하시기 바랍니다.');
			return;
		}
		
		var reqFullDate = "";
		if ( getSelectedVal('cboReqPass').value == '4' || getSelectedVal('cboReqPass').value == '5') {
			var reqdate = replaceAllString($('#datDeploy').val(), '/', '');
			var reqtime = replaceAllString($('#txtReqTime').val(), ':', '');
//			var reqtime = $('#hourTxt').val() + $('#minTxt').val();
			
			reqFullDate = reqdate + reqtime;
			var nowFullDate = getDate('DATE',0) + getTime();
			
			if(reqdate.length == 0) {
				confirmDialog2.alert('적용일자(특정일시)를 입력해 주시기 바랍니다.');
				return;
			}
			if(reqtime == 0) {
				confirmDialog2.alert('적용시간(특정일시)를 입력해 주시기 바랍니다.');
				return;
			}
			if (reqtime.length != 4) {
				dialog.alert("4자리 숫자로 입력하여 주시기 바랍니다.");
				return;
			}
			if( nowFullDate > reqFullDate) {
				confirmDialog2.alert('적용일시(특정일시)가 현재일시 이전입니다. 정확히 선택하여 주십시오.');
				return;
			}
		}
		updtDeploy(getSelectedVal('cboReqPass').value, reqFullDate);
	});
	
	//전체회수 클릭
	$('#btnAllCncl').bind('click', function() {
		if (ingSw) {
			dialog.alert('현재 신청내용 처리 중입니다. 잠시 후 이용해 주세요.');
		} else {
			if (reqInfoData[0].befsw == 'Y') {
				// 20230524 neo. 전체회수, 반려 시 선행 정보 있음 팝업 알림 개선
				//confirmDialog2.alert("다른 사용자가 선행작업으로 지정한 신청 건이 있습니다. \n"+
				//                     "해당 신청 건 사용자에게 선행작업 해제 요청 후 \n" +
				//                     "선행작업으로 지정한 신청 건이 없는 상태에서 진행하시기 바랍니다.");
				confirmDialog2.alert("선행 신청 건이 있습니다. \n"+
									 "선행작업 해제 요청 후 신청 건이 없는 상태에서 진행하시기 바랍니다.");

				return;
			} else {			
				mask.open();
		        confirmDialog.confirm({
					title: '전체회수',
					msg: '[' + $('#txtAcptNo').val() +'] 를 전체회수 할까요?',
				}, function(){
					mask.close();
					if(this.key === 'ok') {
						confirmDialog.prompt({
					        title: "전체회수",
					        msg: '전체회수 사유를 입력하시기 바랍니다.'
					    }, function () {
					        if(this.key === 'ok') {
					        	if (this.input.value.trim() == '' || this.input.value.length == 0) {
					        		confirmDialog2.alert('전체회수 사유를 입력하시기 바랍니다.');
					        	} else {
					        		allCncl(this.input.value);
					        	}
					        }
					    });
					}
				});
			}
		}
	});
	//전체재처리 클릭
	$('#btnRetry').bind('click', function() {
		if (ingSw) {
			confirmDialog2.alert('현재 신청하신 다른 내용을 처리 중입니다.');
			return;
		}
		mask.open();
        confirmDialog.confirm({
			title: '작업확인',
			msg: '전체 재처리를 시작할까요?',
		}, function(){
			mask.close();
			if(this.key === 'ok') {
				svrProc('Retry');
			}
		});
	});
	//다음단계진행 클릭
	$('#btnNext').bind('click', function() {
		if (ingSw) {
			confirmDialog2.alert('현재 신청하신 다른 내용을 처리 중입니다.');
			return;
		}
		mask.open();
        confirmDialog.confirm({
			title: '작업확인',
			msg: '정지되어 있는 처리를 계속 진행할까요?',
		}, function(){
			mask.close();
			if(this.key === 'ok') {
				svrProc('Sttry');
			}
		});
	});
	//오류건 재처리 클릭
	$('#btnErrRetry').bind('click', function() {
		if (ingSw) {
			confirmDialog2.alert('현재 신청하신 다른 내용을 처리 중입니다.');
			return;
		}
		mask.open();
        confirmDialog.confirm({
			title: '작업확인',
			msg: '오류건에 대한 재처리를 시작할까요?',
		}, function(){
			mask.close();
			if(this.key === 'ok') {
				svrProc('Errtry');
			}
		});
	});
	//단계완료 클릭
	$('#btnStepEnd').bind('click', function() {
		if (ingSw) {
			confirmDialog2.alert('현재 신청하신 다른 내용을 처리 중입니다.');
			return;
		}
		if (reqInfoData[0].signteam == "SYSFT2"  && reqInfoData[0].errsysft2 == "1") {
			if (reqGridData != null && reqGridData != undefined) {
				var secuDateNotExist = false;
				for(var i=0; i<reqGridData.length; i++){
					if((reqGridData[i].cr_secudate == null || reqGridData[i].cr_secudate == "") 
						&& (reqGridData[i].cr_securst == "2" || reqGridData[i].cr_securst == "1") ){
						secuDateNotExist = true;
					}
				}
				
				if(secuDateNotExist){
					dialog.alert("취약성검증(포티)에서 취약점이 검출되었습니다. \n기한을 등록후 단계완료 하시기 바랍니다.");
					return;
				}
			} else {
				dialog.alert("체크인 목록 확인 후 시도 하시기 바랍니다.", function () {
					$('#tab1Li').trigger("click");
				});
				return;
			}
		}
		
  		//mx.controls.Alert.show("[신청번호 : "+strAcptNo+"]에 대한 현재 단계를 완료처리 할까요?","단계완료처리확인",3,this,procChk2);
  		
     	var cTitle = "단계완료처리확인";
     	var cMsg = "[신청번호 :"+$('#txtAcptNo').val()+"]에 대한 현재 단계를 완료처리 할까요?";
     	if (!ckindetail) {
     		cTitle = "완료처리확인";
     		cMsg = "[신청번호 :"+$('#txtAcptNo').val()+"]를 완료처리 할까요?";
     	} 
     	
     	mask.open();
        confirmDialog.confirm({
			title: cTitle,
			msg: cMsg
		}, function(){
			mask.close();
			if(this.key === 'ok') {
				nextConf('1', reqInfoData[0].signteam, '수기완료처리');
			}
		});
	});
	//선택건회수 클릭
	$('#btnSelCncl').bind('click', function() {
		if (ingSw) {
			confirmDialog2.alert('현재 신청하신 다른 내용을 처리 중입니다.');
			return;
		}
		var allcncl = false;
		var cnclDataList = new Array;
		var cnt	= 0;

		var reqGridSeleted = reqGrid.getList("selected");
		
		for (var i=0; i < reqGridSeleted.length; i++) {
			if (reqGridSeleted[i].check && reqGridSeleted[i].visible) {
				cnclDataList.push(reqGridSeleted[i]);
			}
		}
		
		//if (reqGridSeleted.length == 0) {
		if (cnclDataList.length == 0) {
			confirmDialog2.alert('회수대상을 선택하여 주시기 바랍니다.');
			return;
		}
		
		for(var i =0; i < reqGridData.length; i++){
			if(reqGridData[i].check == 'true' && reqGridData[i].visible == 'true') {
				cnt++;
			}
		}
		
		if(cnclDataList.length == cnt) {
			allcncl = true;
		}
		
//		for (var j=0; j < reqGridSeleted.length; j++) {
//			for(var i =0; i < reqGridData.length; i++){
//				if (reqGridData[i].check && reqGridData[i].visible) {
//					//cnclDataList.push($.extend({}, this, {__index: undefined}));
//					cnclDataList.push(reqGridData[i]);
//				} else {
//					if(reqGridData[i].baseitemid != reqGridData[i].cr_itemid){
//						allcncl = true;
//						break;
//					}
//				}
//			}
//		}
		
		if (allcncl) {
			mask.open();
	        confirmDialog.confirm({
				title: '전체회수',
				msg: '[' + $('#txtAcptNo').val() +'] 를 전체회수 할까요?',
			}, function(){
				mask.close();
				if(this.key === 'ok') {
					confirmDialog.prompt({
				        title: "전체회수",
				        msg: '전체회수 사유를 입력하시기 바랍니다.'
				    }, function () {
				        if(this.key === 'ok') {
				        	if (this.input.value.trim() == '' || this.input.value.length == 0) {
				        		confirmDialog2.alert('전체회수 사유를 입력하시기 바랍니다.');
				        	} else {
				        		allCncl(this.input.value);
				        	}
				        }
				    });
				}
			});
			cnclDataList = null;
		} else {
			if (cnclDataList.length != 0){
				
				mask.open();
		        confirmDialog.confirm({
					title: '선택회수',
					msg: '[' + $('#txtAcptNo').val() +'] 를 선택회수 할까요?',
				}, function(){
					mask.close();
					if(this.key === 'ok') {
						selCncl(cnclDataList);
					}
				});
			}
		}
	});
	//우선순위수정클릭
	$('#btnSeq').bind('click', function() {
		mask.open();
        confirmDialog.confirm({
			title: '수정확인',
			msg: '신청건에 대한 우선순위 정보를 Update 하시겠습니까?',
		}, function(){
			mask.close();
			if(this.key === 'ok') {
				var tmpArray = [];
				var tmpObj = new Object();
				var data = {};
				
				for (var i=0;reqGridData.length>i;i++) {
					if (reqGridData[i].priority == null || reqGridData[i].priority == '' || reqGridData[i].priority == undefined) {
						dialog.alert('우선순위를 입력한 후 다시 수정하십시오. ['+reqGridData[i].cr_rsrcname+']');
						return;
					}
					tmpObj = new Object();
					tmpObj.cr_serno = reqGridData[i].cr_serno;
					tmpObj.priority = reqGridData[i].priority;
					tmpArray.splice(reqGridData.length,0,tmpObj);
				};
				data = {
						 AcptNo  : pReqNo,
					   fileList  : tmpArray,
					requestType  : 'updtSeq'
				}
				var ajaxReturnData = ajaxCallWithJson('/webPage/ecmr/Cmr0250Servlet', data, 'json');
				data = null;
				tmpArray = null;
				tmpObj = null;
				if (ajaxReturnData == null || ajaxReturnData == '' || ajaxReturnData == undefined) {
					dialog.alert('우선순위 수정에 실패하였습니다.');
					return;
				}
				if (typeof ajaxReturnData == 'string' && ajaxReturnData.indexOf('ERR')>=0) {
					dialog.alert(ajaxReturnData);
					return;
				}
				if (ajaxReturnData == '0') {
					dialog.alert('우선순위 수정이 완료되었습니다.');
					
					$('#btnQry').trigger('click');
				} else {
					dialog.alert('우선순위 수정 중 오류가 발생하였습니다.');
				}
			}
		});
	});
	
	//새로고침 클릭
	$('#btnQry').bind('click', function() {
		refresh();
	});
	//우선적용 클릭
	$('#btnPriority').bind('click', function() {
		var btnText = $('#btnPriority').text().trim();
     	mask.open();
        confirmDialog.confirm({
			title: btnText,
			msg: '[' + $('#txtAcptNo').val() +'] 를 ' + btnText + ' 할까요?',
		}, function(){
			mask.close();
			if(this.key === 'ok') {
				if (btnText == '우선적용') {
					priorityProc('1');
				} else {
					priorityProc('0');
				}
			}
		});
	});
	//결재클릭
	$('#btnApproval').bind('click', function() {
		if (ingSw) {
			confirmDialog2.alert('현재 신청하신 다른 내용을 처리 중입니다.');
			return;
		}

		//20221018 neo. 운영배포신청 이면서, 본인확인 결재단계 이면  결재사유를 필수로 입력하도록 로직 추가. 
		if (   reqInfoData[0].signteamcd == '2' //본인확인 단계
	    	&& pUserId == reqInfoData[0].cr_editor
	    	&& $('#txtConMsg').val().trim().length == 0) {//사유 입력 내용이 없을때
			//this.input.value.trim() == '' || this.input.value.length == 0
			confirmDialog2.alert('결재 사유를 입력해 주시기 바랍니다.');
			return;
		}
		
		finalConfirm();
	});
	//반려클릭
	$('#btnCncl').bind('click', function() {
		if (ingSw) {
			confirmDialog2.alert('현재 신청하신 다른 내용을 처리 중입니다.');
			return;
		}
		//20230524 neo. 반려 버튼 클릭 시 선행작업 유무 체크 로직 추가.
		if ( reqInfoData[0].befsw == 'Y' ) {
			confirmDialog2.alert("선행 신청 건이 있습니다. \n"+
			                     "선행작업 해제 요청 후 신청 건이 없는 상태에서 진행하시기 바랍니다.");
			return;
		}
		
	    if($('#txtConMsg').val().trim().length == 0){
	    	confirmDialog2.alert('반려의견을 입력하여 주십시오.');
	    	return;
	    }
     	mask.open();
        confirmDialog.confirm({
			title: '반려확인',
			msg: '반려처리하시겠습니까?',
		}, function(){
			mask.close();
			if(this.key === 'ok') {
		        nextConf('3', pUserId, $('#txtConMsg').val());
			}
		});
	});
	
	
	//닫기클릭
	$('#btnClose').bind('click', function() {
		/*
		if (window.opener.getRequestList != undefined){
			//window.opener.getRequestList();
		}
		*/
		closeCk = true;
		self.close();
	});
	
	// 20240103 엑셀저장버튼 클릭
	$('#btnExcel').bind('click', function() {
		if($('#chkDetail').is(':checked')) {
			$('#chkDetail').trigger('click');
		}
		setTimeout(function() {
			reqGrid.exportExcel('list.xls');
		}, 1000);
	});
	
		
	/**
	 * ------------------------------------------------------------------------------------------------------------------------------
	 * 										       button click -> modal popup event
	 * ------------------------------------------------------------------------------------------------------------------------------
	 */	
	//산출물 확인
	$("#btnFile").bind("click", function() {
		openFileListCom2();
	});
	//선후행작업확인 클릭
	$('#btnBefJob').bind('click', function() {
		openBefJobListModal();
	});
	
	/**
	 * ------------------------------------------------------------------------------------------------------------------------------
	 *                                             button click -> window open event
	 * ------------------------------------------------------------------------------------------------------------------------------
	 */

	//20221018 neo. 배포결과등록 버튼 이벤트 추가.
	$('#cmdFileAdd').bind('click',function(){
		fileGbn = 'A';
		dirGbn = '21';
		popCloseFlag = false;
		setTimeout(function() {
			fileUploadModal.open({
				width: 685,
				height: 420,
				iframe: {
					method: "get",
					url: "../modal/fileupload/ComFileUpload.jsp"
				},
				onStateChanged: function () {
					if (this.state === "open") {
						mask.open();
					}
					else if (this.state === "close") {
						mask.close();
					}
				}
			});
		}, 200);
	});
	
	//소스취약성확인(포티) 클릭
	$('#cmdFoti').bind('click', function() {
		openWindow('fotifyopen', '', reqInfoData[0].cr_secuurl);
	});
	
	
	$('#cmdFotiCheck').bind('click', function() {
		var data = {
			acptNo : pReqNo,
			requestType	: 'fotifyINF_Analysis_check'
		}
		ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json', successFotifyINF_Analysis_check);
	});
	
	
	//소스취약성확인 클릭
	$('#cmdFt').bind('click', function() {
		//ExternalInterface.call("ftCall",strAcptNo,strUserId);
		//http://172.23.1.201:14260/ci/result.do?userid="+userid+"&reqno="+acptno
		//"help:no,menubar=no,status=no,resizable=yes,scroll=no,width="+ window.screen.availWidth +",height=" + window.screen.availHeight
		openWindow('ftCall', pReqNo, '');
	});
	//요청사항 클릭
	$('#cmdMemo').bind('click', function() {
		dialog.alert(reqInfoData[0].cr_memo);
	});

	//SR정보확인 클릭
	$('#cmdSRInfo').bind('click', function() {
		openWindow('SRINFO', '', reqInfoData[0].cc_srid);
	});
	//소스보기 클릭
	$('#btnSrcView').bind('click', function() {
		openWindow('SRCVIEW', '', '');
	});
	//소스비교 클릭
	$('#btnSrcDiff').bind('click', function() {
		openWindow('SRCDIFF', '', '');
	});
	//로그확인 클릭
	$('#btnLog').bind('click', function() {
		openWindow('LOGVIEW', '', '');
	});
	//결재정보 클릭
	$('#btnApprovalInfo').bind('click', function() {
		openWindow('APPROVAL', '', '');
	});

	//기한등록 클릭
	$('#cmdRegiFotiDate').bind('click', function() {
		var tmpItemid = "";
		var selectItems = [];
		
		var selectItems = reqGrid.getList("selected");
		if(selectItems.length == 0 ){
			dialog.alert("기한관리를 하실 파일을 선택 후 등록해주세요");
			return;
		}

		for (var i=0;selectItems.length>i;i++) {
			tmpItemid += selectItems[i].cr_itemid+",";
		}
		
		if(tmpItemid == ""){
			dialog.alert("기한관리를 하실 파일을 선택 후 등록해주세요");
			return;
		}
		var ndateStr = getDate('DATE',0);
		var datFotiStr = replaceAllString($("#datFoti").val(), "/", "");
		
		if( ndateStr > datFotiStr){
			dialog.alert("날짜 선택이  잘못되었습니다. 다시선택해주세요.");
			return;
		}
		//Cmr0250.regiFotiDate(tmpItemid , strAcptNo ,datFotiStr);
		var data = {
			itemid : tmpItemid,
			acptno : pReqNo,
			fotidate : datFotiStr,
			requestType	: 'regiFotiDate'
		}
		ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json', successRegiFotiDate);
	});
	
	//조건부결재등록
	$("#cmdOneAll").bind("click", function() {
		var tmpItemid = "";
		var selectItems = reqGrid.getList("selected");
		if(selectItems.length == 0 ){
			dialog.alert("조건부결재 관리 하실 파일을 선택 후 등록해주세요.");
			return;
		}
		
		for (var i=0;selectItems.length>i;i++) {
			tmpItemid += selectItems[i].cr_itemid+",";
		}

		if(tmpItemid == ""){
			dialog.alert("조건부결재 관리 하실 파일을 선택 후 등록해주세요.");
			return;
		}

		var oneOrAll = "";
		if( $('input[name="oneAllgbn"]:checked').val() == "0") oneOrAll = "ONE";
		else oneOrAll = "ALL";
		//Cmr0250.onOrAllPass(tmpItemid , strAcptNo , oneOrAll);
		var data = {
			itemid : tmpItemid,
			acptno : pReqNo,
			oneOrAll : oneOrAll,
			requestType	: 'onOrAllPass'
		}
		ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json', successOnOrAllPass);
	});
	
	$("#cmdSms").bind('click', function() {
		if(reqInfoData[0].signteamcd == "4" && reqInfoData[0].secuchk == "1") {
			selectConfUsr(); 
		} else {
			//Cmr0250.getSmsUserList(pUserId, reqInfoData[0].signteam);
			var data = {
				sinUsrId : pUserId,
				gyulUsrId : reqInfoData[0].signteam,
				requestType	: 'getSmsUserList'
			}
			
			ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json', successGetSmsUserList);
		}
	});
	//SMS연계결재
	$("#cmdSmsOk").bind('click', function() {
		if (ingSw) {
			dialog.alert("현재 신청하신 다른 내용을 처리 중입니다.");
			return;
		} else {
			mask.open();
		    confirmDialog.confirm({
				title: '결재확인',
				msg: "결재처리하시겠습니까?"
			}, function(){
				mask.close();
				if(this.key === 'ok') {
					//Cmr0250.getSmsNoChk(pReqNo,txtSmsNo.text);
					var data = {
						acptNo : pReqNo,
						smsNo : $("#txtSmsNo").val(),
						requestType	: 'getSmsNoChk'
					}

					ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json', successGetSmsNoChk);
				}
			});
		}
	});
	
	
	setTimeout(function() {
		//최초 화면로딩 시 조회(새로고침버튼 로직)
		$('#btnQry').trigger('click');
	}, 20);
	
};

// 20241119 포티파이 분석결과 확인 클릭
function successFotifyINF_Analysis_check(data) {
	if(data != null && data.length > 0) {
		dialog.alert(data.substr(1), function() {
			$('#btnQry').trigger('click');
		});
	}
}

//20221018 neo. 첨부 한 결과등록파일  업로드 진행. 
function cmdFileAddUpload(){
	fileGbn = 'U';
	dirGbn = '21';
	popCloseFlag = false;
	subDocPath = acptNo.substr(0,4)+'/'+acptNo.substr(4,2);
	
	for (var i=0;upFiles.length>i;i++) {
		upFiles[i].saveFileName = '1_' + acptNo.substr(6,6) + '_' + (i+1);
	}
	setTimeout(function() {
		fileUploadModal.open({
			width: 685,
			height: 420,
			iframe: {
				method: "get",
				url: "../modal/fileupload/ComFileUpload.jsp"
			},
			onStateChanged: function () {
				if (this.state === "open") {
					mask.open();
				}
				else if (this.state === "close") {
					console.log('@@@ [2] popCloseFlag:',popCloseFlag);
					if (popCloseFlag) {
						refresh();
					} else {
						dialog.alert('첨부된 파일 저장에 실패하였습니다.');
					}
					mask.close();
				}
			}
		});
	}, 200);
}
//20221018 neo. 결과 파일 첨부 이벤트
function addFile(dataList) {
	upFiles = [];
	for (var i=0;dataList.length>i;i++) {
		var tmpObj = new Object(); // 그리드에 추가할 파일 속성
		tmpObj.name = dataList[i].name;
		tmpObj.size = dataList[i].size;
		tmpObj.sizeReal = dataList[i].sizeReal;
		tmpObj.newFile = true;
		tmpObj.realName = dataList[i].realName;
		tmpObj.file = dataList[i].file;
		upFiles.push(tmpObj);
	}
	if ( upFiles.length>0 ) {
		dialog.alert('선택한 첨부파일은 결재 시 등록(업로드) 진행됩니다.[총:'+upFiles.length+'건]');
		//cmdFileAddUpload();
	}
}
//20221018 neo. 결과 파일 첨부 이벤트
function setFile(dataList) {
	if (dataList.length>0) {
		var tmpArray = [];
		var tmpObject = new Object();
		for (var i=0;dataList.length>i;i++) {
			tmpObj = new Object();
			tmpObj.acptno = acptNo;
			tmpObj.realName = dataList[i].name;
			tmpObj.saveName = subDocPath+'/'+dataList[i].saveFileName;
			tmpObj.filegb = '1';
			tmpObj.seq = i+1;		
			tmpArray.push(tmpObj);
		}
		
		var tmpData = {
			   fileList :	tmpArray,
			requestType : 	'setDocFile'
		}
		var ajaxReturnData = ajaxCallWithJson('/webPage/common/DocFileServlet', tmpData, 'json');
		if (ajaxReturnData == null || ajaxReturnData == '' || ajaxReturnData == undefined) {
			dialog.alert('첨부파일기록 작성 중 오류가 발생하였습니다. [setDocFile]');
			ingSw = false;
			return;
		}
		if (typeof(ajaxReturnData) == 'string' && ajaxReturnData.indexOf('ERR')>-1) {
			dialog.alert(ajaxReturnData);
			ingSw = false;
			return;
		}
	}
}

function successOnOrAllPass(data) {
	if(data == "YES"){
		dialog.alert("파일의 조건부결재관리가 등록되었습니다.");
	}else{
		dialog.alert("파일의 조건부결재관리가 등록되지 않았습니다. 관리자에게 문의하십시오.");
	}
	
	$('#btnQry').trigger('click');
}
function successRegiFotiDate(data) {
	if(data == "YES"){
		dialog.alert("파일의 취약점 수정 기한이 "+$("#datFoti").val()+"로 등록되었습니다.");
	}else{
		dialog.alert("기한등록이 되지 않았습니다. 관리자에게 문의하십시오.");
	}
	
	$('#btnQry').trigger('click');
}
function openFileListCom2() {
	setTimeout(function() {
		reqFileListModal.open({
	        width: 800,
	        height: 400,
	        iframe: {
	            method: "get",
	            url: "../modal/request/ReqFileListModal.jsp"
	        },
	        onStateChanged: function () {
	            if (this.state === "open") {
	                mask.open();
	            }
	            else if (this.state === "close") {
	                mask.close();
	            }
	        }
	    }, function () {
	    });
	}, 200);	
}
function successGetSmsNoChk(data) {
	if(data > 0){
		nextConf('1', reqInfoData[0].signteam, $('#txtConMsg').val());
	   	//Cmr3100.nextConf(pReqNo, reqInfoData[0].signteam, txtConMsg.text, "1", reqInfoData[0].cr_qrycd);
	} else {
		dialog.alert("인증번호가 일치하지 않습니다. 다시 확인해 주세요.");
	}
}
function selectConfUsr() {
	//결재자선택창 띄움

	strGyulusr = "";
	deptCd = reqInfoData[0].signteam;

	setTimeout(function() {
		smsConfirmSelectModal.open({
			width: 1000,
			height: 600,
			iframe: {
				method: "get",
				url: "../modal/requestDetail/SmsConfirmSelectModal.jsp"
			},
			onStateChanged: function () {
				if (this.state === "open") {
					mask.open();
				} else if (this.state === "close") {
					mask.close();
					if (strGyulusr != null && strGyulusr != "" && strGyulusr != undefined) {
						//Cmr0250.setSmsReq(strAcptNo,pUserId, strGyulusr);
						setSmsReq(strGyulusr);
					}
				}
			}
		});
	}, 200);
}
function setSmsReq(gyulUsr) {
	var data = {
		acptNo : pReqNo,
		sinUsrId : pUserId,
		gyulUsrId : gyulUsr,
		requestType	: 'setSmsReq'
	}
	
	ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json', successSetSmsReq);
}
function successGetSmsUserList(data) {
	var userInfo_dp = data;
	var gyulname = "";
	var sinname = "";
	var gyultel = "";
	var sintel = "";
	
	for (var j=0 ; j<userInfo_dp.length ; j++) {
		if(userInfo_dp[j].cm_userid == reqInfoData[0].signteam) {
			gyultel = userInfo_dp[j].cm_telno;
			gyulname = userInfo_dp[j].cm_username;
		} else {
			sintel = userInfo_dp[j].cm_telno;
			sinname = userInfo_dp[j].cm_username;
		}
	}
	if (gyultel != null && sintel != null) {
		//dialog.alert("발신자("+sinname+") : " + sintel + "\n" + "수신자("+gyulname+") : " + gyultel + "\nSMS 결재요청을 하시겠습니까?","SMS결재 요청",3,this, smsSend);

		mask.open();
	    confirmDialog.confirm({
			title: 'SMS결재 요청',
			msg: "발신자("+sinname+") : " + sintel + "\n" + "수신자("+gyulname+") : " + gyultel + "\nSMS 결재요청을 하시겠습니까?"
		}, function(){
			mask.close();
			if(this.key === 'ok') {
				//Cmr0250.setSmsReq(pReqNo, pUserId, reqInfoData[0].signteam);

				setSmsReq(reqInfoData[0].signteam);
			}
		});
	} else dialog.alert("전화번호가 등록되어 있지 않습니다.\n확인 바랍니다.");
}
function successSetSmsReq(data) {
	if(data=="OK"){
		smsSw = "1";
		dialog.alert("SMS 전송이 완료되었습니다.\n인증 번호를 입력해주세요.", function() {
			$("#txtSmsNo").focus();
		});
		document.getElementById('lblSmsNo').style.visibility = "visible";
		document.getElementById('txtSmsNo').style.visibility = "visible";
		document.getElementById('cmdSmsOk').style.visibility = "visible";
		$("#cmdSmsOk").prop('disabled', false);
		document.getElementById('lblConf').style.visibility = "visible";
		document.getElementById('txtConMsg').style.visibility = "visible";
		$("#txtSmsNo").prop("readonly", false);
 	    $("#txtConMsg").val("SMS 결재요청");
 	    
 	    timer = 0;
 	    startTimer();
	} else {
		if (data.substring(0,1) == "1"){
			dialog.alert("SMS 전송 실패하였습니다.\n" + "결재자 : " +  data.substr(1) + "님의 번호가 없습니다.","SMS결재 오류");
		} else if (data.substring(0,1) == "2"){
			dialog.alert("SMS 전송 실패하였습니다.\n" + "신청자 : " +  data.substr(1) + "님의 번호가 없습니다.","SMS결재 오류");
		} else if (data.substring(0,1) == "3"){
			dialog.alert("SMS 전송 실패하였습니다.\n" +  data.substr(1) + " 번호가 없습니다.","SMS결재 오류");
		} else {
			dialog.alert("SMS 전송 실패하였습니다. 관리자에게 문의바랍니다.");	
		}
	}
}

function startTimer() {
	$("#txtSmsNo").val("");

	autoRefreshInter = setInterval(function() {
		timer++;
		if (timer >= 300) { //5분경롸
			funcSetScript();
		} else {
			var oldTime = new Date().getTime();
			var nowTime = new Date().getTime();
			var secGap = (now - old) / 1000;
			var minGap = (now - old) / 1000 / 60;
			$("#txtSmsNo").prop("placeholder", minGap+"분"+secGap+"초"+ "/5분");
		}
	}, 1000);
}
function funcSetScript() {
	clearInterval(autoRefreshInter);
	autoRefreshInter = null;
	$("#txtSmsNo").val("");
	$("#txtSmsNo").prop("readonly", true);
	$("#cmdSmsOk").prop("disabled", true);
	dialog.alert("시간이 경과되었습니다.");
	return false;
}


// 새로고침
function refresh() {
	refreshCk = true;
	detailCk = false;
	$("#chkDetail").wCheck("check", false);
	
	resetScreen();
	checkAdmin();
}

//환성화 비활성화 초기화로직
function resetScreen(){

	if (!ckindetail ) {
		$('#tab1').append(loading_div);
	} else {
		$('#tab2').append(loading_div);
	}
	$(".loding-div").show();
	$("#divNormal").hide();
	$('#btnUpdate').css('display','none');
	$('[data-ax5select="cboReqPass"]').ax5select("disable");						//처리구분  콤보 비활성화
	$("#lblConf").css("display","none");
	$("#txtConMsg").css("display","none");
	$("#lblHusrid").css("display","none");
	$("#txtHusrid").css("display","none");
	$("#txtHusrid").prop("disabled", true);
	
	$('#datDeploy').prop("disabled", true);
	$('#btnReqDate').prop("disabled", true);
	$('#txtReqTime').prop("disabled", true);

	$("#btnPriority").css("display","none");
	$("#lblEtc").css("display","none");
	$("#txtEtc").css("display","none");
	$("#divReturn").css("display","none");
	$("#cmdSms").css("display","none");

	$("#divForti").css("display","none");
	$("#divRadio").css("display","none");
	$("#cmdOneAll").css("display","none");

	$("#lblSRID").hide();
	$("#txtSRID").hide();
	$("#txtSRTitle").hide();
	$("#cmdSRInfo").hide();
	$("#txtSRTitle").css("width", "100%");
		
	if (!ckindetail ) {
		reqGrid.config.columns = ckOutGridColumns;
		reqGrid.setConfig();

		$("#cmdFoti").css("display", "none");
		$("#cmdFotiCheck").css("display", "none");
		$("#cmdFt").css("display", "none");
		$("#cmdMemo").css("display", "none");
		
		$("#btnSelCncl").css("display", "none");//선택건회수
		$("#btnFile").css("display", "none");//산출물
		$("#btnBefJob").css("display", "none");//선후행
//		$("#btnSrcView").css("display", "none");//소스보기
//		$("#btnSrcDiff").css("display", "none");//소스비교
		if (reqCd != "05") $("#btnAllCncl").css("display","none");
		$("#btnStepEnd").text("완료처리");
	} else {
		$("#onePass").wCheck("check", true);
		//$("#cmdSms").css("display","");
		$("#cmdSms").prop("disabled", true);
		$("#cmdFoti").css("display", "");
		$("#cmdFotiCheck").css("display", "");
		$("#cmdFt").css("display", "");
		$("#cmdMemo").css("display", "");
		$("#cmdFoti").prop("disabled", true);
		$("#cmdFotiCheck").prop("disabled", true);
		$("#cmdFt").prop("disabled", true);
		$("#cmdMemo").prop("disabled", true);
		$("#cmdFoti").css("color", "#b3b0b0");
		$("#cmdFotiCheck").css("color", "#b3b0b0");
		$("#cmdFt").css("color", "#b3b0b0");
		$("#cmdMemo").css("color", "#b3b0b0");
		
		if (pReqCd == '07') {
			reqGrid.updateColumn({key: "viewver", 		label: "체크인버전",  	width: '10%', align: 'center'}, 5);
	
			$("#lblEtc").css("display","");
			$("#txtEtc").css("display","");
			
		} else {
			reqGrid.updateColumn({key: "viewver", 		label: "배포버전",  	width: '10%', align: 'center'}, 5);
			if (pReqCd == '04') {
				$("#btnPriority").css("display","");
			}
		}
	}

	$('#btnSrcView').hide();					//소스보기
	$('#btnSrcDiff').hide();					//소스비교

	//2018.03.13 포티파이 취약점 결재의견관련 처음에  안보이게
	$("#divFortiMsg").css("display","none");
	$("#divForti").css("display","none");
	//2018.03.13 포티파이 취약점 결재의견관련 처음에  안보이게 end

	$('#btnFile').prop("disabled", true);						//산출물
	$('#btnBefJob').prop("disabled", true);						//선후행작업확인
	$('#btnPriority').prop("disabled", true);					//우선적용
	$('#btnApproval').prop("disabled", true);					//결재
	$('#btnCncl').prop("disabled", true);						//반려
	
	$('#btnAllCncl').prop("disabled", true);					//전체회수
	$('#btnRetry').prop("disabled", true);						//전체재처리
	$('#btnNext').prop("disabled", true);						//다음단계진행
	$('#btnErrRetry').prop("disabled", true);					//오류건재처리
	$('#btnStepEnd').prop("disabled", true);					//단계완료

	$('#btnSelCncl').prop("disabled", true);					//선택건회수
	$('#btnSeq').prop("disabled", true);					    //우선순위적용
	$('#btnErrSkip').hide();
	
	$("#txtItsm").hide();
	$("#lbitsm").hide();
	$("#txtDeploy").hide();

    //SMS 연계
    if(smsSw == "1"){
		document.getElementById('lblSmsNo').style.visibility = "visible";
		document.getElementById('txtSmsNo').style.visibility = "visible";
		document.getElementById('cmdSmsOk').style.visibility = "visible";
		//$("#cmdSmsOk").prop('disabled', false);
		document.getElementById('lblConf').style.visibility = "visible";
		document.getElementById('txtConMsg').style.visibility = "visible";
    } else{
		document.getElementById('lblSmsNo').style.visibility = "hidden";
		document.getElementById('txtSmsNo').style.visibility = "hidden";
		document.getElementById('cmdSmsOk').style.visibility = "hidden";
    }
    
	reqGrid.setData([]);
	reqGrid.repaint();
	resultGrid.setData([]);
	resultGrid.repaint();
	
	$(".loding-div").remove();
	
}
//어드민 여부 확인
function checkAdmin(){
	data = {
		UserID  : pUserId,
		requestType  : 'isAdmin2'
	}
	isAdmin = ajaxCallWithJson('/webPage/common/UserInfoServlet', data, 'json');
	data = null;

	getReqInfo();
}

function  getCodeInfo () {
	var reqCodes = getCodeInfoCommon([
		new CodeInfoOrdercd('REQUEST','','N','1',''),
		new CodeInfoOrdercd('REQPASS','SEL','N','1',''),
		new CodeInfoOrdercd('SECUGYUL','SEL','N','1','')
	]);
	var reqCodeDatas = reqCodes.REQUEST;
	cboReqPassData = reqCodes.REQPASS;
	cboFotiGbnData = reqCodes.SECUGYUL;
	
	var i=0;
	var contentHistory = '';
	for (i=0; i<reqCodeDatas.length; i++) {
		if (reqCodeDatas[i].cm_micode == reqCd) {
			contentHistory = "변경신청 <strong> &gt; "+ reqCodeDatas[i].cm_codename+"상세</strong>";
			break;
		}
	}
	$('#reqBody').contents().find('#history_wrap').html(contentHistory);
	reqCodeDatas = null;
	
	//처리구분코드정보 가져오기
//	options = [];
//	$.each(cboReqPassData,function(key,value) {
//		if (value.cm_micode == '4' && pReqCd != '04') return false;
//		if (value.cm_micode == '2' && pReqCd != '03' && pReqCd != '04' && pReqCd != '06') return false;
//		
//		options.push({value: value.cm_micode, text: value.cm_codename});
//	});
//	$('[data-ax5select="cboReqPass"]').ax5select({
//		options: options
//	});

	$('[data-ax5select="cboReqPass"]').ax5select({
        options: injectCboDataToArr(cboReqPassData, 'cm_micode' , 'cm_codename')
	});

	$('[data-ax5select="cboFotiGbn"]').ax5select({
        options: injectCboDataToArr(cboFotiGbnData, 'cm_micode' , 'cm_codename')
	});
	
}
//항목상세보기
function gridData_Filter(){
	if (reqGridOrgData != null && reqGridOrgData.length < 1) return;
	
	reqGridChgData = clone(reqGridOrgData);
	
	if(reqGridChgData.length == 0) {
		reqGridData = clone(reqGridOrgData);
		return;
	}
	
	for(var i =0; i < reqGridChgData.length; i++){
		if(reqGridChgData[i].cr_baseitem != reqGridChgData[i].cr_itemid || reqGridChgData[i].cr_itemid == undefined){
			reqGridChgData.splice(i,1);
			i--;
		}
	};

	if (!$('#chkDetail').prop('checked')){
		reqGridData = clone(reqGridChgData);
		reqGrid.setData(reqGridData);
		//reqGrid.repaint();
		reqGrid.align();
	} else {
		reqGridData = clone(reqGridOrgData);
//		for(var i =0; i < reqGridData.length; i++) {
//			if(reqGridData[i].cr_baseitem != reqGridData[i].cr_itemid){
//				reqGridData[i].filterData = true;
//
//				if (reqGridData[i].enabled == "0") reqGridData[i].__disable_selection__ = true;
//				//reqGridData[i].__disable_selection__ = true;
//			} else {
//				reqGridData[i].filterData = false;
//				reqGridData[i].__disable_selection__ = false;
//			}
//		}
		reqGrid.setData(reqGridData);
		reqGrid.align();
	}
	// 처음에 sort 가 제대로 안먹혀 sort 한번 실행
	if(reqGrid.sortInfo["cr_rsrcname"] == undefined){
		var sortInfo = {
			cr_rsrcname : {seq : 0, orderBy: "desc"}
		}
		reqGrid.setColumnSort(sortInfo);
	}
	gridSw1 = false;
}

//tmp파일 무삭제 처리시작
function tmpFileNotDelete(baseitem) {
	ingSw = true;

	data = new Object();
	data = {
			 AcptNo	: pReqNo,
			 ItemId	: baseitem,
		requestType : 'updtTemp'
	}
	ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json',successUpdtTemp);
}
//tmp파일 무삭제 처리완료
function successUpdtTemp(data) {
	ingSw = false;
	
	if (data == '0') {
		confirmDialog2.alert('Temp에 생성되는 스크립트파일이 삭제되지 않습니다.');
	}else  {
		confirmDialog2.alert('Temp에 생성되는 스크립트파일이 삭제되지 않도록 처리하는 중 오류가 발생하였습니다.');
	}
}
//개별회수 처리시작
function progCncl(baseitem, signteam){
	ingSw = true;

	data = new Object();
	data = {
			 AcptNo : pReqNo,
			 ItemId : baseitem,
			 PrcSys : signteam,
		requestType : 'progCncl'
	}
	ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json',successProgCncl);
}
//개별회수 처리완료
function successProgCncl(data) {
	ingSw = false;
	
	if (typeof data == 'string' && data.indexOf('ERR')>=0) {
		dialog.alert(data);
		return;
	} 
	if (data == '2') {
		confirmDialog2.alert('현재 서버에서 다른처리를 진행 중입니다. 잠시 후 다시 처리하여 주시기 바랍니다.');
		return;
	} 
	confirmDialog2.alert('개별회수 처리가 완료되었습니다.');
	
	if (data != '0') $('#btnNext').prop("disabled", false);	 //다음단계진행 활성화
	
	$('#btnQry').trigger('click');
}
//선택건회수 처리시작
function selCncl(cnclDataList) {
	ingSw = true;

	data = new Object();
	data = {
			 AcptNo	: pReqNo,
		   fileList	: cnclDataList,
			 PrcSys	: reqInfoData[0].confusr,
		requestType : 'progCncl_sel'
	}
	ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json',successProgCncl_sel);
}
//선택건회수 처리완료
function successProgCncl_sel(data) {
	ingSw = false;
	
	if (typeof data == 'string' && data.indexof('ERR')>=0) {
		dialog.alert(data);
		return;
	}
	if (data == '2') {
		confirmDialog2.alert('현재 서버에서 다른처리를 진행 중입니다.\n 잠시 후 다시 처리하여 주시기 바랍니다.');
		return;
	} 
	confirmDialog2.alert('선택건 회수처리가 완료되었습니다.');
	$('#btnQry').trigger('click');
}
//전체회수 처리시작
function allCncl(inputMsg) {
	ingSw = true;
	
	data =  new Object();
	data = {
			 AcptNo		: pReqNo,
			 UserId		: pUserId,
			 conMsg		: inputMsg,
			ConfUsr		: reqInfoData[0].confusr,
		requestType		: 'reqCncl'
	}
	ajaxAsync('/webPage/ecmr/Cmr3200Servlet', data, 'json',successReqCncl);
}
//전체회수 처리완료
function successReqCncl(data) {
	ingSw = false;
	
	if (data == '0') {
		confirmDialog2.alert('전체회수 처리가 완료되었습니다.', function(){
			winclose('OK');
		});
		return;
	} else if (data == '2') {
		dialog.alert('현재 형상관리서버에서 다른처리를 진행하고 있습니다.\n잠시 후 다시 처리하여 주시기 바랍니다.');
	} else {
		dialog.alert('요청한 프로세스가 처리 중이거나 기 결재된 신청 건입니다.('+data+') 관리자에게 문의하시기 바랍니다.');
	}
	$('#btnQry').trigger('click');
}

//처리구분 수정
function updtDeploy(reqPass, deployDt) {
	ingSw = true;

	data =  new Object();
	data = {
			 AcptNo		: pReqNo,
			ReqPass		: reqPass,
		 DeployDate		: deployDt,
			 PassCd		: '',
		requestType		: 'updtDeploy'
	}
	ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json',successUpdtDeploy);
}
//처리구분 수정완료
function successUpdtDeploy(data) {
	ingSw = false;
	
	if (data == '0') {
		confirmDialog2.alert('배포구분 수정이  완료 되었습니다.');
	}else{
		confirmDialog2.alert(data);
	}
	$('#btnQry').trigger('click');
}
//우선적용 또는 해제 처리시작
function priorityProc(priority) {
	ingSw = true;
	
	data =  new Object();
	data = {
			 AcptNo		: pReqNo,
			     CD		: priority,
		requestType		: 'updtDeploy_2'
	}
	ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json',successUpdtDeploy_2);
}
//우선적용 또는 해제 완료
function successUpdtDeploy_2(data) {
	ingSw = false;
	
	var btnText = $('#btnPriority').text().trim();
	if (data == '0') {
		confirmDialog2.alert('[' + btnText + '] 처리가 완료되었습니다.');

		if (btnText == '우선적용') $('#btnPriority').text('우선해제');
		else $('#btnPriority').text('우선적용');
	} else {
		confirmDialog2.alert('[' + btnText + '] 처리 중 오류가 발생하였습니다. - ' + data);
	}
}

//결재, 반려 실행 , 단계완료
function nextConf(gyulGbn, confUsr, conMsg) {
	if(ingSw) return;
	ingSw = true;
	
	if (null == conMsg || undefined  == conMsg || 'undefined ' == conMsg) {
		conMsg = '';
	}
	//2018.03.14 취약점(포티)결재시  결재메시지
	if(reqInfoData[0].errsysft2 == "1" ){
		if(reqInfoData[0].cr_jogun == "Y" || reqInfoData[0].cr_jogun == "N"){
			conMsg = "["+getSelectedVal('cboFotiGbn').cm_codename+"]"+$("#txtConMsgFoti").val();
		}
	}
	
	//20221018 neo. 첨부파일 업로드는 결재 일때만 진행 할 수 있도록, 결재인지 반려인지 gyulGbnCd 변수에 값 세팅. 3:반려  1:결재
	gyulGbnCd = gyulGbn;
	
	data =  new Object();
	data = {
			 AcptNo     : 	pReqNo,
			 UserId     : 	confUsr,
			 conMsg     : 	conMsg,
			     Cd     : 	gyulGbn,
			  ReqCd     : 	pReqCd,
		requestType		:  'nextConf'
	}
	ajaxAsync('/webPage/ecmr/Cmr3100Servlet', data, 'json',successNextConf);
}
//결재, 반려 처리완료, 단계완료 처리 후 리턴
function successNextConf(data) {
	ingSw = false;
	smsSw = "0";
	
	if (data == '0') {
		//20221018 neo. 운영배포신청 이면서, 본인확인 결재단계 이면서, 첨부파일이 있는경우, 업로드 진행
		//20221018 neo. 운영배포신청 이면서, 본인확인 단계이면서, 진행중 일때, 결과등록 할 수 있도록 첨부 버튼 활성화
		if (   reqInfoData[0].cr_status == '0' //진행중
	    	&& reqInfoData[0].signteamcd == '2' //본인확인 단계
	    	&& pUserId == reqInfoData[0].cr_editor //본인 일때
	    	&& upFiles.length > 0  //업로드 할 파일이 존재 할때
	    	&& gyulGbnCd == '1' ) { //결재일때만 업로드 진행
			cmdFileAddUpload();
		} else {
			winclose('OK');
		}
	} else if (data == '2') {
		//20220621 neo. 단계완료 클릭 시 프로세스 떠 있을때
		dialog.alert('현재 형상관리서버에서 처리 진행 중 입니다.\n잠시 후 다시 처리하여 주시기 바랍니다.');
		$('#btnQry').trigger('click');
	} else {
		dialog.alert('처리에 실패했습니다. \n[ERROR='+data+']');
		$('#btnQry').trigger('click');
	}
}

function winclose(gbn) {
	
//	if (gbn == 'OK') window.opener.popClose(gbn);
	try {
		if (window.opener != undefined && window.opener.CmdQry_click != undefined){
			window.opener.CmdQry_click();
		}
		if (window.opener != undefined && window.opener.getRequestList != undefined){
			window.opener.getRequestList();
		}

		window.open('about:blank','_self').self.close();
	} catch(e) {
		window.open('about:blank','_self').self.close();
	}
	//window.open('about:blank','_self').self.close();
	
}
//자동처리 실행
function svrProc(prcSysGbn) {
	ingSw = true;

	data =  new Object();
	data = {
			 AcptNo		: pReqNo,
			 UserId		: pUserId,
		      prcCd		: prcSysGbn,
		     prcSys		: reqInfoData[0].signteam,
		requestType		: 'svrProc'
	}
	
	ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json',successSvrProc);
}
//자동처리 완료
function successSvrProc(data) {
	ingSw = false;

	if (data == '0') {
		confirmDialog2.alert("재처리작업이 신청되었습니다. 잠시 후 다시받기를 하여 확인하여 주시기 바랍니다.");
	}else if (data == '2') {
		confirmDialog2.alert("현재 서버에서 다른처리를 진행 중입니다. 잠시 후 다시 처리하여 주시기 바랍니다.");
	} else  {
		confirmDialog2.alert("재처리작업 신청 중 오류가 발생하였습니다.\n\n"+data);
	}
}

function setTabMenu(){
	
	if (!ckindetail ) {
		$(".tab_content:first").show();
		if (!gridSw1) {
			createViewGrid1();
			gridSw1 = true;
		}
	} else {
		$("#tab2").show();
		if (!gridSw2) {
			createViewGrid2();
			gridSw2 = true;
		}
	}
	
	$("ul.tabs li").click(function () {
		$(".tab_content").hide();
		var activeTab = $(this).attr("rel");
		$("ul.tabs li").removeClass('on');
		$(this).addClass("on");
		$activeTab = $("ul.tabs li.on").prop("id");
		$("#" + activeTab).show(0,function(){
			$(window).trigger("resize");
			if(refreshCk || (gridSw1 || gridSw2)){
				refreshCk = false;
				if($activeTab == "tab1Li"){
					if (!gridSw1) {
						createViewGrid1();
						gridSw1 = true;
					}
					getProgList();
				} else {
					if (!gridSw2) {
						createViewGrid2();
						gridSw2 = true;
					}
					getRstList();
					getPrcSysInfo();
				}
			}

			if($activeTab == "tab1Li"){
				if (null != reqGridData && reqGridData != undefined && reqGridData.length>0) {
					//포티파이 취약점 있고 본인일때만 기한등록 보여짐
					if (reqInfoData[0].signteam == "SYSFT2"  && reqInfoData[0].errsysft2 == "1" ) {
						if (reqInfoData[0].cr_editor == pUserId || isAdmin) {
							
							var secuDataExist = false;
							for(var i=0; i<reqGridData.length; i++){
								if(reqGridData[i].cr_securst == "2" || reqGridData[i].cr_securst == "1" ){
									secuDataExist = true;
									break;
								}
							}
							//20230511 neo. 취약점수정기한등록제외[시스템속성:28] 값에 따라 활성화 되도록 조건 추가
							//20230517 young. 체크 - 기한등록가능.
							//if(secuDataExist){
							if( reqInfoData[0].cm_sysinfo.substr(27,1) == "1" && secuDataExist ){
								$("#divForti").css("display","");
							}
						}
					} else if(reqInfoData[0].errsysft2 == "1" && !$('#btnApproval').is(':disabled') && $('#btnStepEnd').is(':disabled')) {
						$("#divRadio").css("display","");
						$("#cmdOneAll").css("display","");
					}
				}
				reqGrid.align();
			}else {
				$("#divForti").css("display","none");
				$("#divRadio").css("display","none");
				$("#cmdOneAll").css("display","none");
				resultGrid.align();
			}
		});

	});
}
//신청정보가져오기
function getReqInfo() {
	data =  new Object();
	data = {
		 UserId	    : pUserId,
		 AcptNo		: pReqNo,
		requestType		: 'getReqList'
	}
	ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json',successGetReqList);
}

//체크인 목록가져오기 완료
function successGetProgList(data) {
	$(".loding-div").remove();
	reqGridData = data;
//	reqGridOrgData = data;

//	getRstList();
	
	if (reqGridData.length>0) {

		//포티파이 취약점 있고 본인일때만 기한등록 보여짐
		if (reqInfoData[0].signteam == "SYSFT2"  && reqInfoData[0].errsysft2 == "1" ) {
			if (reqInfoData[0].cr_editor == pUserId || isAdmin) {
				
				var secuDataExist = false;
				for(var i=0; i<reqGridData.length; i++){
					if(reqGridData[i].cr_securst == "2" || reqGridData[i].cr_securst == "1" ){
						secuDataExist = true;
						break;
					}
				}
				//20230511 neo. 취약점수정기한등록제외[시스템속성:28] 값에 따라 활성화 되도록 조건 추가
				//20230517 young. 체크 - 기한등록가능.
				//if(secuDataExist){
				if ( reqInfoData[0].cm_sysinfo.substr(27,1) == "1" && secuDataExist  ){
					$("#divForti").css("display","");
				}
			}
		} else if(reqInfoData[0].errsysft2 == "1" && !$('#btnApproval').is(':disabled') && $('#btnStepEnd').is(':disabled')) {
			$("#divRadio").css("display","");
			$("#cmdOneAll").css("display","");
		}
		
		for (var i=0; reqGridData.length>i ; i++) {
			if (reqGridData[i].check == 'true') {
				if (pReqCd != "03") {
					reqGridData[i].check = true;
					$("#btnSelCncl").show();	//선택건회수 활성화
					$('#btnSelCncl').prop("disabled", false);	    //선택건회수 활성화
			    	reqGrid.config.showRowSelector = true;
			    	reqGrid.setConfig();
				}
			} else {
				reqGridData[i].check = false;
			}
			if (reqGridData[i].visible == "true") reqGridData[i].visible = true;
			else reqGridData[i].visible = false;
			
			//if (reqGridData[i].visible == 'false') reqGridData[i].__disable_selection__ = true;
			//firstGridData[j].__disable_selection__ = true;
			if (reqGridData[i].enabled == "0") reqGridData[i].__disable_selection__ = true;
			else if (reqGridData[i].cr_baseitem != reqGridData[i].cr_itemid) {
				reqGridData[i].__disable_selection__ = true;
			}
		}
		
		reqGridOrgData = clone(reqGridData);
		
		$('#btnQry').prop('disabled',false);
		$('#btnApprovalInfo').prop('disabled',false);
		//항목상세보기 옵션
		gridData_Filter();
		
	}
	
}
//처리결과 가져오기
function getRstList() {
	//처리결과가져오기
//	data =  new Object();
//	data = {
//			UserId		: pUserId,
//			AcptNo		: pReqNo,
//			prcSys		: '',
//		requestType		: 'getRstList'
//	}
//	ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json',successGetRstList);
	
	rstlistThreadData = [];
	rstParamThreadData= [];
	
	var data =  new Object();
	
	var rstcnt = 0;
	if (null == reqInfoData || reqInfoData == undefined) {
		data = {
			AcptNo		 : pReqNo,
			requestType	 : 'CheckRstCnt'
		}
		rstcnt = ajaxCallWithJson('/webPage/ecmr/Cmr0250Servlet', data, 'json');
	} else {
		rstcnt = (null == reqInfoData[0].rstcnt || reqInfoData[0].rstcnt == undefined)? 0 : reqInfoData[0].rstcnt;
	}
	
	if (rstcnt == 0 || rstcnt < 2000) {
		//처리결과가져오기
		data = {
			UserId			: pUserId,
			AcptNo			: pReqNo,
			prcSys			: '',
			requestType		: 'getRstList'
		}
		ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json',successGetRstList);
	} else {
		var totalFor = (rstcnt/2000) + 1;

		var k=0;
		for (var i=0; i<totalFor; i++) {
			data = {
				UserId			: pUserId,
				AcptNo			: pReqNo,
				prcSys			: '',
				strNum			: k+1,
				endNum			: k+2000,
				requestType		: 'getRstList'
			}
			rstParamThreadData[i] = data;
			k = k+2000;
		}

		runThreadRst(rstParamThreadData[0]);
	}
}
function runThreadRst(data) {
	ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json', successThreadRstList);
}

function successThreadRstList(data) {
	rstlistThreadData = clone(rstlistThreadData.concat(data));

	if (rstParamThreadData.length > 0) {
		rstParamThreadData.splice(0,1);
		if (rstParamThreadData.length > 0) {
			runThreadRst(rstParamThreadData[0]);
		} else {
			successGetRstList(rstlistThreadData);
		}
	}
}


//처리결과확인 목록 가져오기 완료
function successGetRstList(data) {
	resultGridData = data;
	resultGrid.setData(resultGridData);
	resultGrid.repaint();
	
	if (cboPrcSysData != null && cboPrcSysData.length>0) {
		$('#cboPrcSys').trigger('change');
	}
}
//신청정보가져오기 완료
function successGetReqList(data) {
	reqInfoData = data;
	if ( reqInfoData.length > 0 ) {
		
		$('#txtReq').val(reqInfoData[0].reqName);
		$('#txtSyscd').val(reqInfoData[0].cm_sysmsg);			//시스템
		$('#txtEditor').val(reqInfoData[0].cm_username);		//신청자
		$('#txtEditor').prop("title", reqInfoData[0].cm_username);		//신청자
		
		$('#txtReqGbn').val(reqInfoData[0].reqName);			//신청구분
		$('#txtStatus').val(reqInfoData[0].confname);			//진행상태

		$('#txtSayu').val(reqInfoData[0].cr_passcd);			//신청사유
		$('#txtAcptDate').val(reqInfoData[0].acptdate);			//신청일시
		$('#txtPrcDate').val(reqInfoData[0].prcdate);			//완료일시
		$("#txtEtc").val(reqInfoData[0].etcdata);
		
		$('[data-ax5select="cboReqPass"]').ax5select('setValue', reqInfoData[0].cr_passok, true);
		$("#cboReqPass").trigger("change");
		
		if (reqInfoData[0].ermsg != null && reqInfoData[0].ermsg != "") {
			$("#lblErrMsg").val("오류메시지 : " + reqInfoData[0].ermsg);
			$("#lblErrMsg").show();
		}

		if (ckindetail &&  reqInfoData[0].srcview == "Y" && reqCd != "06") {
			if (reqCd != "03") $("#btnSrcDiff").show();
			$("#btnSrcView").show();
		}
		if(reqInfoData[0].cr_memo != null && reqInfoData[0].cr_memo != ""){
			$("#cmdMemo").prop("disabled", false);
			$("#cmdMemo").css("color", "#ff0000");
		}
		if( (reqInfoData[0].cc_srid != null) && (reqInfoData[0].cc_srid != "") ) {
			$("#lblSRID").show();
			$("#txtSRID").show();
			$("#txtSRTitle").show();
			if(reqInfoData[0].cc_srid != "00-000000-01" && reqCd == "04"){
				$("#cmdSRInfo").show();
				$("#txtSRTitle").css("width", "calc(100% - 115px)");
			} 
			$("#txtSRID").val(reqInfoData[0].cc_srid);
			$("#txtSRTitle").val(reqInfoData[0].cc_reqtitle);
		}

		if (reqInfoData[0].file == "1") $("#btnFile").prop("disabled",false);
		if (reqInfoData[0].befjob == "1") {
			$("#btnBefJob").prop("disabled",false);
		}
		if (reqInfoData[0].prcdate != null && reqInfoData[0].prcdate != "")
		   $("#txtPrcDate").val(reqInfoData[0].prcdate);
		if (reqInfoData[0].cr_passcd != null && reqInfoData[0].cr_passcd != "")
		   $("#txtSayu").val(reqInfoData[0].cr_passcd);
		if (reqInfoData[0].confname != null && reqInfoData[0].confname != "")
		   $("#txtStatus").val(reqInfoData[0].confname);
		if (reqInfoData[0].log == "1") $("#btnLog").prop("disabled",false);
		if (reqInfoData[0].cr_status == "3") {
			$("#divReturn").css("display","");
			
			if (reqInfoData[0].cr_conmsg == undefined || reqInfoData[0].cr_conmsg == null || reqInfoData[0].cr_conmsg == "") {
				if (reqInfoData[0].cr_conmsg2 != undefined && reqInfoData[0].cr_conmsg2 != null && reqInfoData[0].cr_conmsg2 != "") {
					$("#lblReturnOP").text("취소사유");
					$("#txtReturnOP").val(reqInfoData[0].cr_conmsg2);
				}
			} else {
				$("#lblReturnOP").text("반려의견");
				$("#txtReturnOP").val(reqInfoData[0].cr_conmsg);
			}
		}
		

		if (ckindetail) {
			//2021.04.10 코드인슈어 연계 수정내용
			if (reqInfoData[0].errsysft_01 == "1" || reqInfoData[0].errsysft_02 == "1" || reqInfoData[0].errsysft_03 == "1"){
				$("#cmdFt").prop("disabled", false);//오류시 취약성점검내용확인
				$("#cmdFt").css("color", "#ff0000");
			}
	//		if (reqInfoData[0].errsysft_02 == "1" || reqInfoData[0].errsysft_03 == "1"){
	//			cmdFt2.enabled = true;
	//		}
			if (reqInfoData[0].signteam == "SYSFT" && (reqInfoData[0].errsysft_01 == "1" || reqInfoData[0].errsysft_02 == "1" || reqInfoData[0].errsysft_03 == "1" || reqInfoData[0].errsysft_04 == "1")) {
				
				var codeSw = false;
				var tmpStr = "";
				
				if (reqInfoData[0].cm_sysinfo.substr(20,1) == "1" && (reqInfoData[0].errsysft_01 == "1" || reqInfoData[0].errsysft_03 == "1")){
					codeSw = true;
					tmpStr = "하드코딩";
				}
				if (reqInfoData[0].cm_sysinfo.substr(21,1) == "1" && (reqInfoData[0].errsysft_02 == "1" || reqInfoData[0].errsysft_03 == "1")) {
					codeSw = true;
					if (tmpStr.length > 0){
						tmpStr = tmpStr + "/특정문자열"
					} else {
						tmpStr = "특정문자열";
					}
				}
				
				
				//관리자 또는 신청자만 다음단계진행 가능
				if ( !codeSw && (reqInfoData[0].cr_editor == pUserId || isAdmin)) {
					$("#btnStepEnd").prop("disabled", false);
				} else if (codeSw && (reqInfoData[0].cr_editor == pUserId || isAdmin)) {
					dialog.alert("소스취약점이 검출되어 다음단계 진행이 불가합니다.(" + tmpStr +")");
				}
			}
			
			//2018.03.27 fotify 취약점 결과 있을시 버튼 활성화
			if(reqInfoData[0].cr_secuurl != "" && reqInfoData[0].cr_secuurl != null ){
				$("#cmdFoti").prop("disabled", false);
				$("#cmdFoti").css("color", "#ff0000");
				fotiURL = reqInfoData[0].cr_secuurl;
			}
			
			//2018.03.13 포티파이 취약점검 에러시   단계완료
			if (reqInfoData[0].signteam == "SYSFT2"  && reqInfoData[0].errsysft2 == "1" ) {
				if (reqInfoData[0].cr_editor == pUserId || isAdmin) {
					if(reqInfoData[0].cr_etc != null && reqInfoData[0].cr_etc != "") {
						// 20241119 취약점 에러시 분석결과확인 활성화 
						$("#cmdFotiCheck").prop("disabled", false);
						$("#cmdFotiCheck").css("color", "#ff0000");
					}
					$("#btnStepEnd").prop("disabled", false);
				}
				
			}
		}
		
		//20221018 neo. 운영배포신청 이면서, 본인확인 단계이면서, 진행중 일때, 결과등록 할 수 있도록 첨부 버튼 활성화
		if (   reqInfoData[0].cr_status == '0' //진행중
	    	&& reqInfoData[0].signteamcd == '2' //본인확인 단계
	    	&& pUserId == reqInfoData[0].cr_editor ) {//본인 일때
			$("#cmdFileAdd").css("display", "");//배포결과등록 버튼 활성화
		} else {
			$("#cmdFileAdd").css("display", "none");//배포결과등록 버튼 비활성화
		}
		
		
		//신청미완료건 결재자 여부확인
		if (reqInfoData[0].endsw == '0') {
			if (ckindetail && reqInfoData[0].signteamcd != "1" && reqInfoData[0].signteamcd != "2" && reqInfoData[0].cr_editor == pUserId ) {
				//SMS 연계  자동결재,본인확인를 제외한 결재단계   / 본인 신청건 만 SMS 결재 기능 활성화 . 
				$("#cmdSms").prop("disabled", false);
			}
			
			data =  new Object();
			data = {
				 AcptNo: pReqNo,
				 UserId: pUserId,
				requestType: 'gyulChk'
			}
			ajaxAsync('/webPage/ecmr/Cmr3100Servlet', data, 'json', successGyulChk);
		} else {//신청완료 건
			aftChk();
		}
	}
}
//결재자 여부확인완료
function successGyulChk(data) {
	if (data.indexOf('ERROR')>-1) {
		dialog.alert(data);
		return;
	}	

	//지금 로그인 사용자가 결재자 일때
	if (data == '0') {
		$('#tab1Li').trigger("click");
		
		$('#btnApproval').prop("disabled", false); //활성화
		if (reqInfoData[0].prcsw == '0' && reqInfoData[0].signteamcd != '8') {		
			$('#btnCncl').prop("disabled", false);
			$('#btnBefJob').prop("disabled", false); //활성화
		} else {
			$('#btnCncl').prop("disabled", true); //비활성화
		}
		
		$("#lblConf").css("display","");
		$("#txtConMsg").css("display","");
		
		if (ckindetail) {
			if(reqInfoData[0].husrid == "true" || reqInfoData[0].husrid == "contents"){
				$("#lblHusrid").css("display","");
				$("#txtHusrid").css("display","");
				$("#txtHusrid").prop("disabled", false);
			}else{
				$("#txtHusrid").prop("disabled", true);
			}
			
			//2018.03.14 취약점(포티) 결재자 조건부 승인 , 반려시 
     	    if(reqInfoData[0].errsysft2 == "1" ){
     	    	if (reqGridData != null && reqGridData != undefined) {
	         	    var secuDataExist = false;
					for(var i=0; i<reqGridData.length; i++){
						if(reqGridData[i].cr_securst == "2" || reqGridData[i].cr_securst == "1" ){
							secuDataExist = true;
							break;
						}
					}
					
					if(secuDataExist){
						$("#lblConf").css("display","none");
						$("#txtConMsg").css("display","none");
						$("#lblHusrid").css("display","none");
						$("#txtHusrid").css("display","none");
						$('#btnCncl').prop("disabled", false); //비활성화
	
						$("#lblFotiGbn").css("display","");
						$("#cboFotiGbn").css("display","");
						$("#lblFotiConf").css("display","");
						$("#txtConMsgFoti").css("display","");
						
						if (reqInfoData[0].cr_jogun == "Y") {
							$("#btnApproval").prop("disabled", false);
					    	reqGrid.config.showRowSelector = true;
					    	reqGrid.setConfig();
		         	    } else if(reqInfoData[0].cr_jogun == "N"){
							$("#btnApproval").prop("disabled", true);
		         	    } 
					}
 	    		}
     	    }

			//시간외배포시추가 20180226
		    if (reqInfoData[0].updtsw2 == "1" &&( reqInfoData[0].cr_passok == "4" || reqInfoData[0].cr_passok == "5") ){
				$("#divNormal").show();
//    			    datDeploy.visible = true;
//    			    txtTime.visible = true;
//    			    lblAplyDate.visible = true;
//    			    txtAplyDate.visible = false;
		    	$("#datDeploy").val(reqInfoData[0].aplydate.substr(0,4)+"/"+reqInfoData[0].aplydate.substr(4,2)+"/"+reqInfoData[0].aplydate.substr(6,2));
				$("#txtReqTime").val(reqInfoData[0].aplydate.substr(8,2)+":"+reqInfoData[0].aplydate.substr(10,2));
		    }
		}
	}  else if (data == "8") {
		dialog.alert("23:30분부터 01:00까지는 결재를 할수 없습니다.");
	} else if (data != "1") {
		dialog.alert("결재정보 체크 중 오류가 발생하였습니다.");
	}

	if($('#btnBefJob').is(":disabled")){
		if(isAdmin || !$("#btnCncl").is(":disabled") || pUserId == reqInfoData[0].cr_editor){
			$("#btnBefJob").prop("disabled",false);
		}
	}
	
	aftChk();
}
function aftChk() {
	if (reqInfoData[0].prcsw == "0" && reqInfoData[0].signteam.substr(0,3) == "SYS") {
		if (ckindetail) {
			if (isAdmin || reqInfoData[0].cr_editor == pUserId) {
				if (reqInfoData[0].signteam == "SYSUP") {
					if (reqInfoData[0].skipsw == "Y") $("#btnErrSkip").show();
				}
				// 20241218 전체재처리 오류건재처리 취약점검증떄는 막기
				if(reqInfoData[0].signteam != "SYSFT2") {
					$("#btnRetry").prop("disabled",false);
				}
				if (reqInfoData[0].cr_editor == pUserId && reqInfoData[0].updtsw3 == "1") {
					if (reqInfoData[0].cr_prcsw == "Y") {
						$("#btnStepEnd").prop("disabled",false);
						if (isAdmin || reqInfoData[0].cr_qrycd != "04") $("#btnAllCncl").prop("disabled",false);
					} else {
						if (reqInfoData[0].signteam == "SYSRC") {
							$("#btnStepEnd").prop("disabled",false);
						} else {
							$("#btnAllCncl").prop("disabled",false);
						}
					}
				} else if (isAdmin) {
					$("#btnAllCncl").prop("disabled",false);
					if (reqInfoData[0].cr_prcsw == "Y" || reqInfoData[0].signteam == "SYSRC") {
						$("#btnStepEnd").prop("disabled",false);
					}
				}
	
				if (reqInfoData[0].errtry == "1") {
					if(reqInfoData[0].signteam != "SYSFT2") {
						$("#btnErrRetry").prop("disabled",false);
					}
				}
				else if (reqInfoData[0].sttry == "1" && reqInfoData[0].signteam != "SYSFT") { // 20260422 SYSFT(코드인슈어)단계일경우 다음단계진행 무조건 막기
						$("#btnNext").prop("disabled",false);
				}
			}
		} else {
			if (reqInfoData[0].signteamcd == "1") {
				if (isAdmin || reqInfoData[0].cr_editor == pUserId) {
					// 20241218 전체재처리 오류건재처리 취약점검증떄는 막기
					if(reqInfoData[0].signteam != "SYSFT2") {
						$("#btnRetry").prop("disabled",false);
					}
	   			   if (reqInfoData[0].errtry == "1") {
	   				if(reqInfoData[0].signteam != "SYSFT2") {
	   					$("#btnErrRetry").prop("disabled",false);
	   				}
	   			   }
	   			   else if (reqInfoData[0].sttry == "1" && reqInfoData[0].signteam != "SYSFT") { // 20260422 SYSFT(코드인슈어)단계일경우 다음단계진행 무조건 막기
	   				   $("#btnNext").prop("disabled",false);
	   			   }
				}
	   		   	$("#btnStepEnd").prop("disabled",false);
	   		}
		}
		
	} else if (reqInfoData[0].prcsw == "0" && isAdmin && reqCd == "04") {//신청 종료 아니면서 관리자 일때
		$("#btnAllCncl").prop("disabled",false);
		$("#btnPriority").prop("disabled",false);
		if (reqInfoData[0].cr_gyuljae == "1") $("#btnPriority").text("우선해제");
		else $("#btnPriority").text("우선적용");
	} else if(reqInfoData[0].prcsw == "0" && reqInfoData[0].cr_editor == pUserId){//신청종료아니면서 신청자일때
		$("#btnAllCncl").prop("disabled",false);
	} else if (reqInfoData[0].prcsw == "0" && reqInfoData[0].updtsw3 == "1") {
		if (isAdmin || reqInfoData[0].cr_editor == pUserId) {
			if (reqInfoData[0].cr_prcsw == "Y") {
				if (reqInfoData[0].cr_qrycd == "04" && isAdmin)
					$("#btnAllCncl").prop("disabled",false);
				else if (reqInfoData[0].cr_qrycd != "04") $("#btnAllCncl").prop("disabled",false);
			} else $("#btnAllCncl").prop("disabled",false);
		}
	}
	/*if (reqInfoData[0].cr_passok == "4") {
		$("#lblAplyDate").show();
		$("#txtReqDate").show();
    	$("#txtReqDate").val(reqInfoData[0].cr_aplydate.substr(0,4)+"-"+
					    	reqInfoData[0].cr_aplydate.substr(4,2)+"-"+
					    	reqInfoData[0].cr_aplydate.substr(6,2)+ " " +
    	                    reqInfoData[0].cr_aplydate.substr(8,2) + ":" + reqInfoData[0].cr_aplydate.substr(10,2));
    }*/
	
	$("#cboReqPass").ax5select("disable");
	if (reqInfoData[0].cr_status == "0" && (reqInfoData[0].cr_editor == pUserId || isAdmin) && reqInfoData[0].prcsw == "0") {
		if (reqInfoData[0].updtsw1 == "1") {
			$("#btnSeq").show();
		}
//		if (reqInfoData[0].updtsw2 == "1") {
			//호윤 임시 막음 2012 06 21
			//if (pReqNo.substring(4,6) == "04") $("#cboReqPass").ax5select("enable");
			//호윤 임시 막음 2012 06 21


//			if(getSelectedVal("cboPass").cm_micode == "1" || getSelectedVal("cboPass").cm_micode == "3"){
//			$("#cmdSayu").show();
//			}else{
//			$("#cmdSayu").hide();
//			}

			//신청근거
			//$("#cboPass").ax5select("enable");
			//$("#cmdPrj").show();
			$("#divNormal").hide();

			//txtTime.$("#hourText").val("");
			//txtTime.$("#minuteText").val("");
			//var cboReqPassDisabled = $("#cboReqPass").attr("disabled") == "disabled" ? true : false;
			
			if (reqInfoData[0].cr_passok == "4" || reqInfoData[0].cr_passok == "5"){
				$("#divNormal").show();
				$("#reqgbnDiv").show();
				$("#txtReqDateBox").hide();
				$("#datDeploy").val(reqInfoData[0].aplydate.substr(0,4)+"/"+reqInfoData[0].aplydate.substr(4,2)+"/"+reqInfoData[0].aplydate.substr(6,2));
				$("#txtTime").val(reqInfoData[0].aplydate.substr(8,2) + ":" + reqInfoData[0].aplydate.substr(10,2));
			}
			
			if (reqInfoData[0].cr_passok == "5") {
				$("#btnUpdate").show();
				$("#btnUpdate").prop("disabled", false);
				$("#datDeploy").prop("disabled", false);
				$("#btnReqDate").prop("disabled", false);
				$("#txtTime").prop("disabled", false);
				$("#txtReqDate").prop("disabled", false);
				
//				$("#btnUpdate").attr("disabled", cboReqPassDisabled);
//				$("#datDeploy").attr("disabled", cboReqPassDisabled);
//				$("#txtTime").attr("disabled", cboReqPassDisabled);
//				$("#txtReqDate").attr("disabled", cboReqPassDisabled);
			}
//		}
//	    reqGrid.config.showRowSelector = true;
			
		    //2018.03.13 포티파이 취약점 있을시 선택 할수 잇도록.
		    if (reqInfoData[0].signteam == "SYSFT2"  && reqInfoData[0].errsysft2 == "1") {
		    	reqGrid.config.showRowSelector = true;
			}
			
	} else {
		reqGrid.config.showRowSelector = false;
	}
	reqGrid.setConfig();
	
	if (reqInfoData[0].updtsw2 == "1" && (reqInfoData[0].cr_passok == "4" || reqInfoData[0].cr_passok == "5")){
		$("#divNormal").show();
		$("#reqgbnDiv").show();
		$("#txtReqDateBox").hide();
		$("#datDeploy").val(reqInfoData[0].aplydate.substr(0,4)+"/"+reqInfoData[0].aplydate.substr(4,2)+"/"+reqInfoData[0].aplydate.substr(6,2));
		$("#txtTime").val(reqInfoData[0].aplydate.substr(8,2) + ":" + reqInfoData[0].aplydate.substr(10,2));
	}
	$("#btnApprovalInfo").prop("disabled",false);
	$("#btnQry").prop("disabled",false);

	if($activeTab == "tab1Li"){
		getProgList();
	} else {
		//getRstList();
		if(refreshCk){
			getPrcSysInfo();
			setTimeout(function() {
				getRstList();
			}, 20);
		} else {
			getPrcSysInfo();
		}
	}
}


function getProgList(){
	pgmlistThreadData = [];
	pgmParamThreadData = [];

	$('[data-ax5grid="reqGrid"] [data-ax5grid-container="root"] [data-ax5grid-container="body"]').append(loading_div);
	$(".loding-div").show();

	var strNum = 0;
	var endNum = 0;

	var progcnt = (null == reqInfoData[0].acptcnt || reqInfoData[0].acptcnt == undefined)? 0 : reqInfoData[0].acptcnt;
	
	if (progcnt == 0 || progcnt < 1000) {
		data =  new Object();
		data = {
			AcptNo			: pReqNo,
			UserId			: pUserId,
			chkYn			: "0",
			qrySw			: detailCk, // 상세 데이터를 한번만 가져오도록
			strNum			: strNum,
			endNum			: endNum,
			requestType		: 'getProgList'
		}
		
		if (ckindetail) {
			ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json', successGetProgList);
		} else {
			ajaxAsync('/webPage/ecmr/Cmr0150Servlet', data, 'json', successGetProgList);
		}
	} else {
		var totalFor = (progcnt/1000) + 1;

		var k=0;
		data =  new Object();
		for (var i=0; i<totalFor; i++) {
			data = {
				AcptNo			: pReqNo,
				UserId			: pUserId,
				chkYn			: "0",
				qrySw			: detailCk, // 상세 데이터를 한번만 가져오도록
				strNum			: k+1,
				endNum			: k+1000,
				requestType		: 'getProgList'
			}
			pgmParamThreadData[i] = data;
			k = k+1000;
		}

		runThreadProc(pgmParamThreadData[0]);
	}
}
function runThreadProc(data) {
	if (ckindetail) {
		ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json', successThreadProgList);
	} else {
		ajaxAsync('/webPage/ecmr/Cmr0150Servlet', data, 'json', successThreadProgList);
	}
}

function successThreadProgList(data2) {
	pgmlistThreadData = clone(pgmlistThreadData.concat(data2));

	if (pgmParamThreadData.length > 0) {
		pgmParamThreadData.splice(0,1);
		if (pgmParamThreadData.length > 0) {
			runThreadProc(pgmParamThreadData[0]);
		} else {
			successGetProgList(pgmlistThreadData);
		}
	}
}

//처리구분 가져오기
function getPrcSysInfo() {
	data =  new Object();
	data = {
			 AcptNo		: pReqNo,
		requestType		: 'getPrcSys'
	}
	ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json', successGetPrcSys);
}
//처리구분 가져오기 완료
function successGetPrcSys(data) {
	cboPrcSysData = data;
	
	options = [];
	$.each(cboPrcSysData,function(key,value) {
	    options.push({value: value.cm_micode, text: value.cm_codename, qrycd: value.qrycd});
	});
	
	$('[data-ax5select="cboPrcSys"]').ax5select({
        options: options
	});
	
	if (cboPrcSysData.length > 0) {
		$('[data-ax5select="cboPrcSys"]').ax5select('setValue',cboPrcSysData[cboPrcSysData.length - 1].cm_micode,true);
		$('#cboPrcSys').trigger('change');		
	}
}

//새창팝업
function openWindow(type, acptNo1, etcInfo) {
	var nHeight, nWidth, cURL, winName;

	if ( (type+'_'+pReqCd) == winName ) {
		if (myWin != null) {
	        if (!myWin.closed) {
	        	myWin.close();
	        }
		}
	}

    winName = type+'_pop_'+pReqCd;

    nWidth  = 1046;
	nHeight = 700;
    if (type === 'PROGINFO') {//프로그램정보
	    nHeight = 750;
		cURL = "/webPage/winpop/PopProgramInfo.jsp";
	} else if (type === 'RESULTVIEW') {//처리결과확인
		cURL = "/webPage/winpop/PopPrcResultLog.jsp";
	} else if (type === 'SCRIPTVIEW') {//스크립트확인
		nHeight = 500;
		cURL = "/webPage/winpop/PopScript.jsp";
	} else if (type === 'SRINFO') {//SR정보확인
		if (reqInfoData == null || reqInfoData == undefined || reqInfoData.length == 0 || reqInfoData[0].cr_editor == undefined) return;
		//cURL = "http://whydea.kjbank.com/whydea/srmsTask.dmn?prjId="+etcInfo+"&userid="+reqInfoData[0].cr_editor;//pUserId;
		cURL = "http://172.24.140.102/whydea/srmsTask.dmn?prjId="+etcInfo+"&userid="+reqInfoData[0].cr_editor;//pUserId;
		myWin = window.open(cURL, winName, "width=1000px,height=600px,top=0px,left=200px,status=,resizable=true,scrollbars=true");
		return;
	} else if (type === 'SRCVIEW') {//소스보기
		nWidth = 1200;
		cURL = "/webPage/winpop/PopRequestSourceView.jsp";
	} else if (type === 'SRCDIFF') {//소스비교
		cURL = "/webPage/winpop/PopRequestSourceDiff.jsp";
	} else if (type == 'PopSourceDiffInf') {
	    cURL = "/webPage/winpop/PopSourceDiffInf.jsp";
	} else if (type == 'PopSourceDiff') {
	    cURL = "/webPage/winpop/PopSourceDiff.jsp";
	} else if (type === 'LOGVIEW') {//로그확인
		cURL = "/webPage/winpop/PopServerLog.jsp";
	} else if (type === 'APPROVAL') {//결재정보
		nHeight = 828;
		cURL = "/webPage/winpop/PopApprovalInfo.jsp";
	} else if (type === 'fotifyopen') {
		myWin = window.open(etcInfo,winName,"menubar=no,status=no,resizable=yes,scrollbars=1,width=1305,height=870,left=10,top=30");
		return;
	} else if (type === 'ftCall') {
		//cURL = "http://172.23.1.201:14260/ci/result.do?userid="+pUserId+"&reqno="+acptNo1;
		//20240513 shjung url 변경됐다고해서 수정함. id는 로그인사용자아니고, 신청자로 파라미터 전달
		cURL = "http://asta.kjbank.com:14260/main/scmresult?reqno="+acptNo1+"&userid="+reqInfoData[0].cr_editor;
		myWin = window.open(cURL,winName,"help:no,menubar=no,status=no,resizable=yes,scroll=no,width="+ window.screen.availWidth +",height=" + window.screen.availHeight);
		//help:no,menubar=no,status=no,resizable=yes,scroll=no,width="+ window.screen.availWidth +",height=" + window.screen.availHeight
		return;
	} else {
		confirmDialog2.alert('window open - popup: invalid type ['+type+'] error', function(){return;});
	}
	
	var f = document.setReqData;
    f.user.value 	= pUserId;
	//POST방식으로 넘기고 싶은 값(hidden 변수에 값을 넣음)
	if (acptNo1 != '' && acptNo1 != null) {
		f.acptno.value	= acptNo1;
	} else {
		f.acptno.value	= pReqNo;
	}
	
	if (etcInfo != '' && etcInfo != null) {
		if (type === 'RESULTVIEW') { //처리결과확인
			f.seqno.value = etcInfo;
		} else if (type === 'SRINFO') { //SR정보확인
			f.srid.value = etcInfo;
		} else if (type === 'PROGINFO' || type === 'SCRIPTVIEW' || type === 'SRCVIEW' || type === 'SRCDIFF' || type === 'PopSourceDiffInf' || type === 'PopSourceDiff') { //프로그램정보, 스크립트확인, 소스보기, 소스비교
			f.itemid.value = etcInfo;
			f.syscd.value = reqInfoData[0].cr_syscd;
		} else {
			f.etcinfo.value = etcInfo;
		} 
	}
    
    myWin = winOpen(f, winName, cURL, nHeight, nWidth);
    
}
//선행작업연결확인 모달 팝업
function openBefJobListModal() {
	setTimeout(function() {
		befJobListModal.open({
	        width: 1045,
	        height: 400,
	        iframe: {
	            method: "get",
	            url: "../modal/request/BefJobListModal.jsp"
	        },
	        onStateChanged: function () {
	            if (this.state === "open") {
	                mask.open();
	            } else if (this.state === "close") {
	                mask.close();
	            }
	        }
	    }, function () {
	    });
	}, 200);
}
//선행작업연결 모달
function openBefJobSetModal() {
	
	setTimeout(function() {
		befJobModal.open({
	        width: 915,
	        height: 600,
		    iframe: {
		        method: "get",
		        url: "../modal/request/BefJobSetModal.jsp"
		    },
		    onStateChanged: function () {
		        if (this.state === "open") {
		        	befJobData = [];
		            mask.open();
		        }
		        else if (this.state === "close") {
		            mask.close();
	            	if(befJobData != null && befJobData != '' && befJobData != undefined && befJobData.length>0){
	            		updateBefJob(befJobData);
	            	} else {
	            		openBefJobListModal();
	            	}
		        }
		    }
		}, function () {
		});
	}, 200);
}

//선행작업연결
function updateBefJob(befJobData){
	data =  new Object();
	data = {
			 AcptNo		: pReqNo,
		    befList		: befJobData,
		requestType		: 'updtBefJob'
	}
	ajaxAsync('/webPage/ecmr/Cmr0200_BefJobServlet', data, 'json', successUpdtBefJob);
}
//선후행작업연결완료
function successUpdtBefJob(data) {
	if (data != '0') {
		confirmDialog2.alert('선행작업 등록에 실패하였습니다.');
	} else {
		openBefJobListModal();
	} 
}

function docDownload(data) {
	var crsrid = reqInfoData[0].cr_srid;
	var reldoc = data.item.cc_reldoc;
	var fileName = data.item.name;
	var fullPath = notiPath + "/" + crsrid + "/" + reldoc;
	fileDown(fullPath, fileName);
	//location.href = homePath + '/webPage/fileupload/upload?fullPath='+fullPath+'&fileName=' + encodeURIComponent(fileName);
}


function finalConfirm() {
	
	if (ingSw) {
		dialog.alert('현재 신청하신 다른내용을 처리 중 입니다.');
		return;
	}
	
	if(reqInfoData[0].husrid == "true"){
		if ($("#txtHusrid").val() != "" && $("#txtHusrid").val().length != 12) {
			dialog.alert("프로젝트 번호를 정확히 입력해주세요. \n" + "예)XX-XXXXXX-XX");
			return;
		} else {
			getHusrid();
		}
	} else if (reqInfoData[0].husrid == "contents") { // 2020 10 15 컨텐츠 배포일시
		if ($("#txtHusrid").val() != "" && $("#txtHusrid").val().length != 12) {
			dialog.alert("프로젝트 번호를 정확히 입력해주세요. \n" + "예)XX-XXXXXX-XX");
			return;
		} else if ($("#txtHusrid").val() != "" && $("#txtHusrid").val().length == 12) {
			getHusrid();
		} else { //if ($("#txtHusrid").val() == ""){
			mask.open();
		    confirmDialog.confirm({
				title: '결재확인',
				msg: '결재처리하시겠습니까?',
			}, function(){
				mask.close();
				if(this.key === 'ok') {
			        nextConf('1', pUserId, $('#txtConMsg').val());
				}
			});
		}	
	}else{
		//2018.03.14 취약점 있는데 결재시  취약점 결재구분 , 결재의견 체크
		if(reqInfoData[0].errsysft2 == "1" ){
     	    if(reqInfoData[0].cr_jogun == "Y" || reqInfoData[0].cr_jogun == "N"){
     	    	
     	    	var secuDataExist = false;
				for(var i=0; i<reqGridData.length; i++){
					if( (reqGridData[i].cr_securst == "2"  || reqGridData[i].cr_securst == "1") 
						&& ( reqGridData[i].allpass == null || reqGridData[i].onepass == 'Y' )	){
							
						secuDataExist = true;
						if(reqGridData[i].onepass == null && reqGridData[i].allpass == null){
							dialog.alert("결재 전 조건부결재관리 등록을 해주시기바랍니다.");
							return;
						}
					}
				}
			
				if(secuDataExist){
					if(getSelectedIndex('cboFotiGbn') < 1 ){
						dialog.alert("취약점이 검출 되었습니다. 취약점 구분을 선택해주시기 바랍니다.");
						return;	
					}
					if($("#txtConMsgFoti").val() == null || $("#txtConMsgFoti").val() == ""){
						dialog.alert("취약점이 검출 되었습니다. 취약점 결재의견을 작성해주시기 바랍니다.");
						return;	
					} 
				}
     	    }
 	    }
		
		mask.open();
	    confirmDialog.confirm({
			title: '결재확인',
			msg: '결재처리하시겠습니까?',
		}, function(){
			mask.close();
			if(this.key === 'ok') {
		        nextConf('1', pUserId, $('#txtConMsg').val());
			}
		});
	}
}
function getHusrid() {
	//Cmr0250.getHusrid(txtHusrid.text,strAcptNo); 
	var data = {
		srid	: $("#txtHusrid").val(),
		acptno  	: pReqNo,
		requestType	: 'getHusrid'
	}
	ajaxAsync('/webPage/ecmr/Cmr0250Servlet', data, 'json',successGetHusrid);
}
function successGetHusrid(data) {
	if(data=="NO"){
		dialog.alert("입력한 프로젝트번호로 변경심의 승인된 건이 없습니다.");
		return;
	} else{
		mask.open();
	    confirmDialog.confirm({
			title: '결재확인',
			msg: '결재처리하시겠습니까?',
		}, function(){
			mask.close();
			if(this.key === 'ok') {
		        nextConf('1', pUserId, $('#txtConMsg').val());
			}
		});
	}
}
function getUserRGTCD(){
	data = new Object();
	data = {
		UserID	: pUserId,
		RGTCD	: "56",
		closeYn	: "N",
		requestType : 'getUserRGTCD'
	}
	ajaxAsync('/webPage/common/UserInfoServlet', data, 'json', successGetUserRGTCD);
}

function successGetUserRGTCD(data){
	if (data.indexOf("56")>=0) strSecu = "Y";
	else strSecu = "N";
}

function getDocStatus(){
	data = new Object();
	data = {
		AcptNo	: pReqNo,
		requestType : 'getDocStatus'
	}
	ajaxAsync('/webPage/ecmr/Cmr0260Servlet', data, 'json', successGetDocStatus);
}

function successGetDocStatus(data){

	var tmpList = data.split(",");
	var i=0;
	for (i=0 ; i<tmpList.length ; i++)
	{
		if (tmpList[i] == "9"){//QA 산출물 점검완료 일때
			$("#btnApproval").prop("disabled",false);
			if (reqInfoData[0].prcsw == "0" && reqInfoData[0].signteamcd != "8") {
			   $("#btnCncl").prop("disabled",false);
			} else {
			   $("#btnCncl").prop("disabled",true);
			}
			$("#txtConMsg").show();
     	    $("#lblConf").show();
			break;
		}
	}
	tmpList = null;
}
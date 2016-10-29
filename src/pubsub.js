/*
Copyright (c) 2010,2011,2012,2013,2014 Morgan Roderick http://roderick.dk
License: MIT - http://mrgnrdrck.mit-license.org

https://github.com/mroderick/PubSubJS
*/
(function (root, factory){
	'use strict';

    if (typeof define === 'function' && define.amd){
        // AMD. Register as an anonymous module.
        define(['exports'], factory);

    } else if (typeof exports === 'object'){
        // CommonJS
        factory(exports);

    }

    // Browser globals
    var PubSub = {};
    root.PubSub = PubSub;
    factory(PubSub);

}(( typeof window === 'object' && window ) || this, function (PubSub){
	'use strict';
     
     //一个messages对象,lastUid属性
	var messages = {},
		lastUid = -1;

    //看到是否有key属性,判断是否是空对象
	function hasKeys(obj){
		var key;

		for (key in obj){
			if ( obj.hasOwnProperty(key) ){
				return true;
			}
		}
		return false;
	}

	/**
	 *	Returns a function that throws the passed exception, for use as argument for setTimeout
	 *	@param { Object } ex An Error object
	 */
	function throwException( ex ){
		return function reThrowException(){
			throw ex;
		};
	}
    //callSubscriberWithDelayedExceptions可以看到exception是在setTimeout中完成的
	function callSubscriberWithDelayedExceptions( subscriber, message, data ){
		try {
			subscriber( message, data );
		} catch( ex ){
			setTimeout( throwException( ex ), 0);
		}
	}

	function callSubscriberWithImmediateExceptions( subscriber, message, data ){
		subscriber( message, data );
	}
    //调用：deliverMessage( message, topic, data, immediateExceptions );
	function deliverMessage( originalMessage, matchedMessage, data, immediateExceptions ){
		var subscribers = messages[matchedMessage],
		  //得到matchedMessage也就是topic对应的回调数组（其中topic表示每次触发的消息，如"a.b.c",那么依次调用的是"a.b.c","a.b","a" ）
			callSubscriber = immediateExceptions ? callSubscriberWithImmediateExceptions : callSubscriberWithDelayedExceptions,
			s;
         //如果没有，直接返回
		if ( !messages.hasOwnProperty( matchedMessage ) ) {
			return;
		}
         //subscribers表示获取到的特定的topic下面的一个调用对象，默认是{}
		for (s in subscribers){
			if ( subscribers.hasOwnProperty(s)){
				//其中subscribers[s]表示的是回调函数，但是originalMessage一直表示的就是调用
				//publish时候传入的第一个参数
				callSubscriber( subscribers[s], originalMessage, data );
			}
		}
	}
    //调用方式：createDeliveryFunction( message, data, immediateExceptions )
    //其中topic表示每次触发的消息，如"a.b.c",那么依次调用的是"a.b.c","a.b","a" 
	function createDeliveryFunction( message, data, immediateExceptions ){
		return function deliverNamespaced(){
			var topic = String( message ),
				position = topic.lastIndexOf( '.' );
                //得到topic，也就是publish("a.b.c")中的最后一个.号
			// deliver the message as it is now
			deliverMessage(message, message, data, immediateExceptions);
            //首先：直接触发一次
			// trim the hierarchy and deliver message to each level
			//然后：分级触发
			while( position !== -1 ){
				topic = topic.substr( 0, position );
				position = topic.lastIndexOf('.');
				deliverMessage( message, topic, data, immediateExceptions );
			}
		};
	}
  //调用方式：messageHasSubscribers( message )表示是否有注册的函数，通过判定特定的topic的回调函数是否为空对象完成
	function messageHasSubscribers( message ){
		var topic = String( message ),
			found = Boolean(messages.hasOwnProperty( topic ) && hasKeys(messages[topic])),
			position = topic.lastIndexOf( '.' );
            //也就是没有这个完整topic同时也是分级的，所以我们会不断判断是否有下面级别的topic
		while ( !found && position !== -1 ){
			topic = topic.substr( 0, position );
			position = topic.lastIndexOf( '.' );
			found = Boolean(messages.hasOwnProperty( topic ) && hasKeys(messages[topic]));
		}

		return found;
	}
   //调用方式：publish( message, data, true, PubSub.immediateExceptions )
   //其中第三个参数表示是否是同步的
	function publish( message, data, sync, immediateExceptions ){
		var deliver = createDeliveryFunction( message, data, immediateExceptions ),
			hasSubscribers = messageHasSubscribers( message );
         //没有回调函数直接返回
		if ( !hasSubscribers ){
			return false;
		}
       //如果是异步的直接setTimeout(0)就可以了
		if ( sync === true ){
			deliver();
		} else {
			setTimeout( deliver, 0 );
		}
		return true;
	}

	/**
	 *	PubSub.publish( message[, data] ) -> Boolean
	 *	- message (String): The message to publish
	 *	- data: The data to pass to subscribers
	 *	Publishes the the message, passing the data to it's subscribers
	**/
	PubSub.publish = function( message, data ){
		return publish( message, data, false, PubSub.immediateExceptions );
	};

	/**
	 *	PubSub.publishSync( message[, data] ) -> Boolean
	 *	- message (String): The message to publish
	 *	- data: The data to pass to subscribers
	 *	Publishes the the message synchronously, passing the data to it's subscribers
	**/
	PubSub.publishSync = function( message, data ){
		return publish( message, data, true, PubSub.immediateExceptions );
	};

	/**
	 *	PubSub.subscribe( message, func ) -> String
	 *	- message (String): The message to subscribe to
	 *	- func (Function): The function to call when a new message is published
	 *	Subscribes the passed function to the passed message. Every returned token is unique and should be stored if
	 *	you need to unsubscribe
	 *返回值用于取消注册的事件
	**/
	PubSub.subscribe = function( message, func ){
		if ( typeof func !== 'function'){
			return false;
		}

		// message is not registered yet
		//默认是空，以message为键，以回调函数为值
		if ( !messages.hasOwnProperty( message ) ){
			messages[message] = {};
		}

		// forcing token as String, to allow for future expansions without breaking usage
		// and allow for easy use as key names for the 'messages' object
		var token = 'uid_' + String(++lastUid);
		messages[message][token] = func;
        //messages['MY TOPIC']={},但是每一个对象都有一个key为uid_+String(++lastUid)
        //其值为回调函数
		// return token for unsubscribing
		return token;
	};

	/* Public: Clears all subscriptions。
	 *clearAllSubscriptions直接把messages对象清空了
	 */
	PubSub.clearAllSubscriptions = function clearAllSubscriptions(){
		messages = {};
	};

	/*Public: Clear subscriptions by the topic.
	  message对象的签名是：messages['MY TOPIC']={}，所以用于取消特定的topic
	*/
	PubSub.clearSubscriptions = function clearSubscriptions(topic){
		var m;
		for (m in messages){
			if (messages.hasOwnProperty(m) && m.indexOf(topic) === 0){
				delete messages[m];
			}
		}
	};

	/* Public: removes subscriptions.
	 * When passed a token（subscribe的返回值为token）, removes a specific subscription.
	 * When passed a function, removes all subscriptions for that function
	 * When passed a topic, removes all subscriptions for that topic (hierarchy)
	 *
	 * value - A token, function or topic to unsubscribe.
	 *
	 * Examples
	 *
	 *		// Example 1 - unsubscribing with a token
	 *		var token = PubSub.subscribe('mytopic', myFunc);
	 *		PubSub.unsubscribe(token);
	 *
	 *		// Example 2 - unsubscribing with a function
	 *		PubSub.unsubscribe(myFunc);
	 *
	 *		// Example 3 - unsubscribing a topic
	 *		PubSub.unsubscribe('mytopic');
	 *    返回值：如果是string，那么直接返回这个uid
	 */
	PubSub.unsubscribe = function(value){
		var isTopic    = typeof value === 'string' && messages.hasOwnProperty(value),
		    //表示有整体的key可以触发
			isToken    = !isTopic && typeof value === 'string',
			//没有整体的key，这时候我们表示要分级处理
			isFunction = typeof value === 'function',
			result = false,
			m, message, t;
        //直接清除,这时候"a.b.c/a.b/a"调用了unsubscribe("a.b")只会剩下"a"
        /*
	                PubSub.subscribe('a', myFunc1);
					PubSub.subscribe('a.b', myFunc2);
					PubSub.subscribe('a.b.c', myFunc3);
				  这时候message={"a":{uid:func},"a.b":{uid:func},"a.b.c":{uid:func}};
				 下面这种情况isTopic为false,于是后面压根不会有任何对messages的操作，虽然都会执行代码：
				 PubSub.subscribe('a.b', myFunc2);
				PubSub.subscribe('a.b.c', myFunc3);
				PubSub.unsubscribe('a');
           */
		if (isTopic){
			PubSub.clearSubscriptions(value);
			return;
		}
		for ( m in messages ){
			if ( messages.hasOwnProperty( m ) ){
				message = messages[m];
                //这里是通过token来清除
                 //messages={"Topic1":{uid:func},"Topic2":{uid:func}};
		        /*
				var token = PubSub.subscribe( 'MY TOPIC', mySubscriber );
				PubSub.unsubscribe( token );
		        */
				if ( isToken && message[value] ){
					delete message[value];
					result = value;
					// tokens are unique, so we can just stop here
					break;
				}
                //如果传入的事function为参数，直接从message中清除掉这函数即可
				if (isFunction) {
					for ( t in message ){
						if (message.hasOwnProperty(t) && message[t] === value){
							delete message[t];
							result = true;
						}
					}
				}
			}
		}

		return result;
	};
}));
